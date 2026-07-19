import { z } from "zod";

export const sourceRecordSchema = z.object({
  sourceRecordId: z.string().min(1),
  sourceIndex: z.number().int().nonnegative(),
  region: z.string(),
  event: z.string(),
  group: z.string(),
  participantName: z.string(),
  scoreRaw: z.string(),
  phone: z.string().optional(),
  idNumber: z.string().optional(),
  sourceFields: z.record(z.string(), z.unknown()).default({}),
});

export type SourceRecord = z.infer<typeof sourceRecordSchema>;

export const requiredCanonicalFields = [
  "region",
  "event",
  "group",
  "participantName",
  "scoreRaw",
] as const;

export type CanonicalField = (typeof requiredCanonicalFields)[number];

export const fieldMappingSchema = z.object({
  region: z.string().min(1),
  event: z.string().min(1),
  group: z.string().min(1),
  participantName: z.string().min(1),
  scoreRaw: z.string().min(1),
  sourceRecordId: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  idNumber: z.string().min(1).optional(),
});

export type FieldMapping = z.infer<typeof fieldMappingSchema>;
