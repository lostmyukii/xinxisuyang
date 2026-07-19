import { z } from "zod";

const extractionSchema = z.object({
  status: z.enum(["STRUCTURE_ONLY", "COMPLETE_RECORDS"]),
  fieldCount: z.number().int().nonnegative().max(10_000).nullable(),
  recordCount: z.number().int().nonnegative().max(1_000_000).nullable(),
  fieldNamesHash: z.string().regex(/^[a-f0-9]{64}$/u).nullable(),
  recordIdsHash: z.string().regex(/^[a-f0-9]{64}$/u).nullable(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/u).nullable(),
}).strict().superRefine((extraction, context) => {
  const values = [
    extraction.fieldCount,
    extraction.recordCount,
    extraction.fieldNamesHash,
    extraction.recordIdsHash,
    extraction.contentHash,
  ];
  if (extraction.status === "STRUCTURE_ONLY" && values.some((value) => value !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "结构探针不得携带记录结果" });
  }
  if (extraction.status === "COMPLETE_RECORDS" && values.some((value) => value === null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "完整记录探针缺少计数或哈希" });
  }
});

export const probeReportSchema = z.object({
  documentPathHash: z.string().regex(/^[a-f0-9]{64}$/u),
  observedAt: z.string().datetime(),
  structure: z.object({
    canvasCount: z.number().int().nonnegative().max(1_000),
    iframeCount: z.number().int().nonnegative().max(100),
    tableCount: z.number().int().nonnegative().max(1_000),
    editableCount: z.number().int().nonnegative().max(10_000),
    hasWorkbookGlobal: z.boolean(),
  }).strict(),
  extraction: extractionSchema,
}).strict();

export type ProbeReport = z.infer<typeof probeReportSchema>;
