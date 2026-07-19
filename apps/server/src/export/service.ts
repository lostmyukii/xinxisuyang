import JSZip from "jszip";
import { z } from "zod";
import type { RankingIssue, RankingRow } from "@xinxisuyang/domain";
import type { CompetitionRepository } from "@xinxisuyang/storage";
import { safeFilename, timestampForFilename } from "./filename.js";
import { createWorkbook } from "./workbook.js";

export const exportRequestSchema = z
  .object({
    scope: z.enum(["group", "event", "all"]),
    region: z.string().optional(),
    event: z.string().optional(),
    group: z.string().optional(),
    includeSensitive: z.boolean().default(false),
    confirmation: z.string().optional(),
  })
  .superRefine((input, context) => {
    if (input.scope === "group" && (input.region === undefined || input.event === undefined || input.group === undefined)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "当前分组导出需要赛区、赛项和组别" });
    }
    if (input.scope === "event" && input.event === undefined) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "当前赛项导出需要赛项" });
    }
    if (input.includeSensitive && input.confirmation !== "INCLUDE_SENSITIVE_FIELDS") {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "敏感字段导出需要二次确认" });
    }
  });

function filterRows<T extends RankingRow | RankingIssue>(
  rows: readonly T[],
  filters: { region?: string; event?: string; group?: string },
): T[] {
  return rows.filter(
    (row) =>
      (filters.region === undefined || row.region === filters.region) &&
      (filters.event === undefined || row.event === filters.event) &&
      (filters.group === undefined || row.group === filters.group),
  );
}

export async function exportCompetition(repository: CompetitionRepository, input: unknown) {
  const request = exportRequestSchema.parse(input);
  const current = repository.getCurrent();
  if (current === null) throw new Error("SNAPSHOT_NOT_FOUND");
  const sourceRecords = repository.getCurrentSourceRecords();
  const now = new Date();
  const time = timestampForFilename(now);
  const sourceLabel = current.summary.source === "manual" ? "手动导入" : current.summary.source;
  const sensitiveLabel = request.includeSensitive ? "_含敏感字段" : "";

  if (request.scope === "all") {
    const events = Array.from(new Set(current.rows.map((row) => row.event))).sort((a, b) => a.localeCompare(b, "zh-CN"));
    const zip = new JSZip();
    for (const event of events) {
      const rows = filterRows(current.rows, { event });
      const issues = filterRows(current.issues, { event });
      const workbook = await createWorkbook({
        snapshot: current.summary,
        rows,
        issues,
        sourceRecords,
        includeSensitive: request.includeSensitive,
        sourceLabel,
        title: `${event} 全部成绩`,
        splitBy: (row) => `${row.region}_${row.group}`,
      });
      zip.file(`信息素养大赛_${safeFilename(event)}_成绩排名${sensitiveLabel}_${time}.xlsx`, workbook);
    }
    const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    repository.recordAudit("export.all", current.summary.id, {
      includeSensitive: request.includeSensitive,
      eventCount: events.length,
    });
    return { buffer, filename: `信息素养大赛_全部赛项_成绩排名${sensitiveLabel}_${time}.zip`, contentType: "application/zip" };
  }

  const filters = {
    ...(request.region === undefined ? {} : { region: request.region }),
    ...(request.event === undefined ? {} : { event: request.event }),
    ...(request.group === undefined ? {} : { group: request.group }),
  };
  const rows = filterRows(current.rows, filters);
  const issues = filterRows(current.issues, filters);
  const title = request.scope === "group"
    ? `${request.region ?? ""} ${request.event ?? ""} ${request.group ?? ""} 成绩排名`
    : `${request.event ?? ""} 成绩排名`;
  const workbook = await createWorkbook({
    snapshot: current.summary,
    rows,
    issues,
    sourceRecords,
    includeSensitive: request.includeSensitive,
    sourceLabel,
    title,
    ...(request.scope === "event" ? { splitBy: (row: RankingRow) => `${row.region}_${row.group}` } : {}),
  });
  const scopeName = request.scope === "group"
    ? `${request.region}_${request.event}_${request.group}`
    : request.event ?? "赛项";
  repository.recordAudit(`export.${request.scope}`, current.summary.id, {
    includeSensitive: request.includeSensitive,
    rowCount: rows.length,
  });
  return {
    buffer: workbook,
    filename: `信息素养大赛_${safeFilename(scopeName)}_成绩排名${sensitiveLabel}_${time}.xlsx`,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
}
