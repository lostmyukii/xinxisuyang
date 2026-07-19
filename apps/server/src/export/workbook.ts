import ExcelJS from "exceljs";
import type { Workbook as WorkbookType, Worksheet } from "exceljs";
import type {
  RankingIssue,
  RankingRow,
  SnapshotSummary,
  SourceRecord,
} from "@xinxisuyang/domain";
import { issueMessages } from "@xinxisuyang/domain";
import { safeSheetName } from "./filename.js";

const { Workbook } = ExcelJS;

export interface WorkbookData {
  snapshot: SnapshotSummary;
  rows: readonly RankingRow[];
  issues: readonly RankingIssue[];
  sourceRecords: readonly SourceRecord[];
  includeSensitive: boolean;
  sourceLabel: string;
  title: string;
  splitBy?: (row: RankingRow | RankingIssue) => string;
}

function styleHeader(worksheet: Worksheet, columnCount: number): void {
  const row = worksheet.getRow(1);
  row.height = 26;
  for (let index = 1; index <= columnCount; index += 1) {
    const cell = row.getCell(index);
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0066CC" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  }
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  worksheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnCount } };
}

function addRankingSheet(
  workbook: WorkbookType,
  name: string,
  rows: readonly RankingRow[],
  sourceById: ReadonlyMap<string, SourceRecord>,
  includeSensitive: boolean,
  used: Set<string>,
): void {
  const worksheet = workbook.addWorksheet(safeSheetName(name, used));
  const headers = ["名次", "赛区", "赛项", "组别", "选手姓名", "成绩", "状态"];
  if (includeSensitive) headers.push("手机号", "身份证号");
  worksheet.addRow(headers);
  for (const row of rows) {
    const values: Array<string | number> = [
      row.rank,
      row.region,
      row.event,
      row.group,
      row.participantName,
      row.score,
      "有效",
    ];
    if (includeSensitive) {
      const source = sourceById.get(row.sourceRecordId);
      values.push(source?.phone ?? "", source?.idNumber ?? "");
    }
    worksheet.addRow(values);
  }
  styleHeader(worksheet, headers.length);
  worksheet.columns = headers.map((header) => ({
    header,
    width: header === "选手姓名" ? 18 : header === "身份证号" ? 24 : 15,
  }));
}

function addMetadata(workbook: WorkbookType, data: WorkbookData, used: Set<string>): void {
  const worksheet = workbook.addWorksheet(safeSheetName("导出说明", used));
  const values: Array<[string, string | number]> = [
    ["文件内容", data.title],
    ["生成时间", new Date().toISOString()],
    ["数据快照 ID", data.snapshot.id],
    ["快照时间", data.snapshot.createdAt],
    ["排名分区", "赛区＋赛项＋组别"],
    ["同分规则", "标准竞赛排名（1、2、2、4）"],
    ["有效记录数", data.rows.length],
    ["异常记录数", data.issues.length],
    ["数据来源", data.sourceLabel],
    ["敏感字段", data.includeSensitive ? "已包含（经二次确认）" : "未包含"],
  ];
  values.forEach((value) => worksheet.addRow(value));
  worksheet.getColumn(1).width = 20;
  worksheet.getColumn(2).width = 48;
  worksheet.getColumn(1).font = { bold: true };
}

function addIssueSheet(
  workbook: WorkbookType,
  issues: readonly RankingIssue[],
  sourceById: ReadonlyMap<string, SourceRecord>,
  includeSensitive: boolean,
  used: Set<string>,
): void {
  if (issues.length === 0) return;
  const worksheet = workbook.addWorksheet(safeSheetName("异常记录", used));
  const headers = ["来源序号", "赛区", "赛项", "组别", "选手姓名", "原始成绩", "异常原因"];
  if (includeSensitive) headers.push("手机号", "身份证号");
  worksheet.addRow(headers);
  for (const issue of issues) {
    const values: Array<string | number> = [
      issue.sourceIndex + 1,
      issue.region,
      issue.event,
      issue.group,
      issue.participantName,
      issue.scoreRaw,
      issueMessages[issue.code],
    ];
    if (includeSensitive) {
      const source = sourceById.get(issue.sourceRecordId);
      values.push(source?.phone ?? "", source?.idNumber ?? "");
    }
    worksheet.addRow(values);
  }
  styleHeader(worksheet, headers.length);
  worksheet.columns = headers.map((header) => ({
    width: header === "异常原因" ? 32 : header === "身份证号" ? 24 : 16,
  }));
}

export async function createWorkbook(data: WorkbookData): Promise<Buffer> {
  const workbook = new Workbook();
  workbook.creator = "信息素养大赛成绩核对系统";
  workbook.created = new Date();
  const used = new Set<string>();
  const sourceById = new Map(data.sourceRecords.map((record) => [record.sourceRecordId, record]));
  const groups = new Map<string, RankingRow[]>();
  for (const row of data.rows) {
    const name = data.splitBy?.(row) ?? "成绩排名";
    const list = groups.get(name) ?? [];
    list.push(row);
    groups.set(name, list);
  }
  if (data.splitBy !== undefined) {
    for (const issue of data.issues) {
      const name = data.splitBy(issue);
      if (!groups.has(name)) groups.set(name, []);
    }
  }
  if (groups.size === 0) groups.set("成绩排名", []);
  for (const [name, rows] of groups) {
    addRankingSheet(workbook, name, rows, sourceById, data.includeSensitive, used);
  }
  addIssueSheet(workbook, data.issues, sourceById, data.includeSensitive, used);
  addMetadata(workbook, data, used);
  const output = await workbook.xlsx.writeBuffer();
  return Buffer.from(output);
}
