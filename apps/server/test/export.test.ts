import { Workbook } from "exceljs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { CompetitionRepository } from "@xinxisuyang/storage";
import { rankCompetition } from "@xinxisuyang/ranking";
import { exportCompetition } from "../src/export/service.js";
import { safeSheetName } from "../src/export/filename.js";

function repositoryWithSnapshot() {
  const repository = new CompetitionRepository({ path: ":memory:", encryptionKey: Buffer.alloc(32, 8) });
  const records = [
    {
      sourceRecordId: "r1",
      sourceIndex: 0,
      region: "东部赛区",
      event: "智能创作",
      group: "小学组",
      participantName: "虚构甲",
      scoreRaw: "96.80",
      phone: "00000000000",
      idNumber: "TEST-ID-ONLY",
      sourceFields: {},
    },
    {
      sourceRecordId: "r2",
      sourceIndex: 1,
      region: "东部赛区",
      event: "算法挑战",
      group: "小学组",
      participantName: "虚构乙",
      scoreRaw: "异常",
      phone: "00000000001",
      idNumber: "TEST-ID-INVALID",
      sourceFields: {},
    },
  ];
  const rules = [
    { event: "智能创作", minScore: "0", maxScore: "100", enabled: true },
    { event: "算法挑战", minScore: "0", maxScore: "100", enabled: true },
  ];
  repository.publish({ records, result: rankCompetition(records, rules), rules, source: "manual" });
  return repository;
}

describe("Excel export", () => {
  it("keeps sheet names valid and unique even for case-only collisions", () => {
    const used = new Set<string>();
    expect(safeSheetName("A/B", used)).toBe("A_B");
    expect(safeSheetName("a/b", used)).toBe("a_b_2");
  });

  it("creates a traceable group workbook without sensitive fields by default", async () => {
    const repository = repositoryWithSnapshot();
    const exported = await exportCompetition(repository, {
      scope: "group",
      region: "东部赛区",
      event: "智能创作",
      group: "小学组",
    });
    const workbook = new Workbook();
    await workbook.xlsx.load(exported.buffer as unknown as ArrayBuffer);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["成绩排名", "导出说明"]);
    const headers = workbook.worksheets[0]?.getRow(1).values;
    expect(headers).toContain("状态");
    expect(headers).not.toContain("手机号");
    expect(exported.buffer.toString("utf8")).not.toContain("00000000000");
    repository.close();
  });

  it("requires an explicit second confirmation for sensitive exports", async () => {
    const repository = repositoryWithSnapshot();
    await expect(
      exportCompetition(repository, {
        scope: "group",
        region: "东部赛区",
        event: "智能创作",
        group: "小学组",
        includeSensitive: true,
      }),
    ).rejects.toThrow();
    const exported = await exportCompetition(repository, {
      scope: "group",
      region: "东部赛区",
      event: "智能创作",
      group: "小学组",
      includeSensitive: true,
      confirmation: "INCLUDE_SENSITIVE_FIELDS",
    });
    const workbook = new Workbook();
    await workbook.xlsx.load(exported.buffer as unknown as ArrayBuffer);
    expect(workbook.worksheets[0]?.getRow(1).values).toContain("手机号");
    expect(exported.filename).toContain("含敏感字段");
    repository.close();
  });

  it("creates an event workbook split by region and group", async () => {
    const repository = repositoryWithSnapshot();
    const exported = await exportCompetition(repository, { scope: "event", event: "智能创作" });
    const workbook = new Workbook();
    await workbook.xlsx.load(exported.buffer as unknown as ArrayBuffer);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["东部赛区_小学组", "导出说明"]);
    expect(workbook.worksheets[0]?.getRow(2).getCell(5).value).toBe("虚构甲");
    repository.close();
  });

  it("creates one workbook per event in the all-events zip", async () => {
    const repository = repositoryWithSnapshot();
    const exported = await exportCompetition(repository, { scope: "all" });
    const zip = await JSZip.loadAsync(exported.buffer);
    expect(Object.keys(zip.files)).toHaveLength(2);
    expect(Object.keys(zip.files).some((name) => name.includes("智能创作"))).toBe(true);
    expect(Object.keys(zip.files).some((name) => name.includes("算法挑战"))).toBe(true);
    const entry = Object.entries(zip.files).find(([name]) => name.includes("智能创作"))?.[1];
    if (entry === undefined) throw new Error("TEST_ZIP_ENTRY_MISSING");
    const workbook = new Workbook();
    await workbook.xlsx.load(await entry.async("nodebuffer") as unknown as ArrayBuffer);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toContain("东部赛区_小学组");
    const invalidEntry = Object.entries(zip.files).find(([name]) => name.includes("算法挑战"))?.[1];
    if (invalidEntry === undefined) throw new Error("TEST_INVALID_ZIP_ENTRY_MISSING");
    const invalidWorkbook = new Workbook();
    await invalidWorkbook.xlsx.load(await invalidEntry.async("nodebuffer") as unknown as ArrayBuffer);
    expect(invalidWorkbook.worksheets.map((sheet) => sheet.name)).toContain("东部赛区_小学组");
    expect(invalidWorkbook.worksheets.map((sheet) => sheet.name)).toContain("异常记录");
    repository.close();
  });

  it("includes explicitly confirmed sensitive columns for invalid records as well", async () => {
    const repository = repositoryWithSnapshot();
    const exported = await exportCompetition(repository, {
      scope: "event",
      event: "算法挑战",
      includeSensitive: true,
      confirmation: "INCLUDE_SENSITIVE_FIELDS",
    });
    const workbook = new Workbook();
    await workbook.xlsx.load(exported.buffer as unknown as ArrayBuffer);
    const issueSheet = workbook.getWorksheet("异常记录");
    expect(issueSheet?.getRow(1).values).toContain("手机号");
    expect(issueSheet?.getRow(2).values).toContain("00000000001");
    expect(issueSheet?.getRow(2).values).toContain("TEST-ID-INVALID");
    repository.close();
  });
});
