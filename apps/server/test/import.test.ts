import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { parseClipboard, parseCsv } from "../src/import/delimited.js";
import { normalizeTable } from "../src/import/normalize.js";
import { prepareImport } from "../src/import/request.js";

const { Workbook } = ExcelJS;

const mapping = {
  region: "赛区",
  event: "赛项",
  group: "组别",
  participantName: "选手姓名",
  scoreRaw: "成绩",
};

describe("manual import", () => {
  it("parses clipboard and CSV into the same canonical records", () => {
    const clipboard = parseClipboard("赛区\t赛项\t组别\t选手姓名\t成绩\n东部赛区\t智能创作\t小学组\t虚构甲\t96.80");
    const csv = parseCsv("赛区,赛项,组别,选手姓名,成绩\n东部赛区,智能创作,小学组,虚构甲,96.80");
    expect(normalizeTable(clipboard, mapping)).toEqual(normalizeTable(csv, mapping));
  });

  it("rejects missing or duplicate mapped fields", () => {
    expect(() => normalizeTable(parseCsv("赛区,成绩\n东部赛区,90"), mapping)).toThrow(
      "IMPORT_MAPPING_FIELD_MISSING",
    );
    expect(() => parseCsv("赛区,赛区\n东部赛区,西部赛区")).toThrow(
      "IMPORT_DUPLICATE_HEADERS",
    );
  });

  it("produces identical canonical records and ranks through clipboard, CSV, and XLSX", async () => {
    const rules = [{ event: "智能创作", minScore: "0", maxScore: "120", enabled: true }];
    const workbook = new Workbook();
    const worksheet = workbook.addWorksheet("裁判成绩");
    worksheet.addRow(["赛区", "赛项", "组别", "选手姓名", "成绩"]);
    worksheet.addRow(["东部赛区", "智能创作", "小学组", "虚构甲", "96.80"]);
    worksheet.addRow(["东部赛区", "智能创作", "小学组", "虚构乙", "96.80"]);
    const bytes = Buffer.from(await workbook.xlsx.writeBuffer());
    const candidates = await Promise.all([
      prepareImport({
        format: "clipboard",
        text: "赛区\t赛项\t组别\t选手姓名\t成绩\n东部赛区\t智能创作\t小学组\t虚构甲\t96.80\n东部赛区\t智能创作\t小学组\t虚构乙\t96.80",
        mapping,
      }, rules),
      prepareImport({
        format: "csv",
        text: "赛区,赛项,组别,选手姓名,成绩\n东部赛区,智能创作,小学组,虚构甲,96.80\n东部赛区,智能创作,小学组,虚构乙,96.80",
        mapping,
      }, rules),
      prepareImport({ format: "xlsx", base64: bytes.toString("base64"), mapping }, rules),
    ]);

    expect(candidates[1]?.records).toEqual(candidates[0]?.records);
    expect(candidates[2]?.records).toEqual(candidates[0]?.records);
    expect(candidates[1]?.result).toEqual(candidates[0]?.result);
    expect(candidates[2]?.result).toEqual(candidates[0]?.result);
    expect(candidates[0]?.result.rows.map((row) => row.rank)).toEqual([1, 1]);
  });
});
