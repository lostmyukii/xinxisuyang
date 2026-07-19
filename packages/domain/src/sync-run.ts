import { z } from "zod";
import { snapshotSourceSchema } from "./snapshot.js";

export const syncRunStateSchema = z.enum(["running", "succeeded", "failed"]);
export type SyncRunState = z.infer<typeof syncRunStateSchema>;

export const syncRunSchema = z.object({
  id: z.string().uuid(),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime().nullable(),
  source: snapshotSourceSchema,
  state: syncRunStateSchema,
  recordCount: z.number().int().nonnegative().nullable(),
  errorCode: z.string().nullable(),
});

export type SyncRun = z.infer<typeof syncRunSchema>;
