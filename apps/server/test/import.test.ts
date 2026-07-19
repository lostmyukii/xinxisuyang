import { describe, expect, it } from "vitest";
import { parseClipboard, parseCsv } from "../src/import/delimited.js";
import { normalizeTable } from "../src/import/normalize.js";

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
});
