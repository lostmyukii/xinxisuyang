import { z } from "zod";

export const probeReportSchema = z.object({
  documentPathHash: z.string().regex(/^[a-f0-9]{64}$/u),
  observedAt: z.string().datetime(),
  structure: z.object({
    canvasCount: z.number().int().nonnegative().max(1_000),
    iframeCount: z.number().int().nonnegative().max(100),
    tableCount: z.number().int().nonnegative().max(1_000),
    editableCount: z.number().int().nonnegative().max(10_000),
    hasWorkbookGlobal: z.boolean(),
  }),
  extraction: z.object({
    status: z.enum(["STRUCTURE_ONLY", "COMPLETE_RECORDS"]),
    fieldCount: z.number().int().nonnegative().max(10_000).nullable(),
    recordCount: z.number().int().nonnegative().max(1_000_000).nullable(),
    fieldNamesHash: z.string().regex(/^[a-f0-9]{64}$/u).nullable(),
    recordIdsHash: z.string().regex(/^[a-f0-9]{64}$/u).nullable(),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/u).nullable(),
  }),
});

export type ProbeReport = z.infer<typeof probeReportSchema>;
