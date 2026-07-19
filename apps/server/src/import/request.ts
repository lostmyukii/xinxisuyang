import { createHash } from "node:crypto";
import { z } from "zod";
import type { EventRule, FieldMapping, SourceRecord } from "@xinxisuyang/domain";
import { fieldMappingSchema, maskParticipantName } from "@xinxisuyang/domain";
import { rankCompetition } from "@xinxisuyang/ranking";
import { normalizeTable } from "./normalize.js";
import { parseClipboard, parseCsv } from "./delimited.js";
import type { RawTable } from "./types.js";
import { parseXlsx } from "./xlsx.js";

export const importRequestSchema = z
  .object({
    format: z.enum(["clipboard", "csv", "xlsx"]),
    text: z.string().max(10 * 1024 * 1024).optional(),
    base64: z.string().max(14 * 1024 * 1024).optional(),
    mapping: fieldMappingSchema,
    expectedHash: z.string().length(64).optional(),
  })
  .superRefine((input, context) => {
    if (input.format === "xlsx" && input.base64 === undefined) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["base64"], message: "XLSX 内容缺失" });
    }
    if (input.format !== "xlsx" && input.text === undefined) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["text"], message: "文本内容缺失" });
    }
  });

export type ImportRequest = z.infer<typeof importRequestSchema>;

async function parseTable(request: ImportRequest): Promise<RawTable> {
  if (request.format === "clipboard") return parseClipboard(request.text ?? "");
  if (request.format === "csv") return parseCsv(request.text ?? "");
  return parseXlsx(Buffer.from(request.base64 ?? "", "base64"));
}

export function candidateHash(records: readonly SourceRecord[]): string {
  return createHash("sha256").update(JSON.stringify(records)).digest("hex");
}

export async function prepareImport(
  input: unknown,
  rules: readonly EventRule[],
): Promise<{
  headers: string[];
  mapping: FieldMapping;
  records: SourceRecord[];
  hash: string;
  preview: {
    recordCount: number;
    validCount: number;
    issueCount: number;
    partitionCount: number;
    missingRuleEvents: string[];
    samples: Array<Record<string, string>>;
  };
  result: ReturnType<typeof rankCompetition>;
}> {
  const request = importRequestSchema.parse(input);
  const table = await parseTable(request);
  const records = normalizeTable(table, request.mapping);
  const result = rankCompetition(records, rules);
  const hash = candidateHash(records);
  const missingRuleEvents = Array.from(
    new Set(
      result.issues
        .filter((issue) => issue.code === "EVENT_RULE_MISSING")
        .map((issue) => issue.event),
    ),
  ).sort((left, right) => left.localeCompare(right, "zh-CN"));

  return {
    headers: table.headers,
    mapping: request.mapping,
    records,
    hash,
    result,
    preview: {
      recordCount: records.length,
      validCount: result.rows.length,
      issueCount: result.issues.length,
      partitionCount: result.partitionCount,
      missingRuleEvents,
      samples: records.slice(0, 5).map((record) => ({
        region: record.region,
        event: record.event,
        group: record.group,
        participantName: maskParticipantName(record.participantName),
        scoreRaw: record.scoreRaw,
      })),
    },
  };
}
