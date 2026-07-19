import { Workbook } from "exceljs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { CompetitionRepository } from "@xinxisuyang/storage";
import { rankCompetition } from "@xinxisuyang/ranking";
import { exportCompetition } from "../src/export/service.js";

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
  ];
  const rules = [{ event: "智能创作", minScore: "0", maxScore: "100", enabled: true }];
  repository.publish({ records, result: rankCompetition(records, rules), source: "manual" });
  return repository;
}

describe("Excel export", () => {
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

  it("creates one workbook per event in the all-events zip", async () => {
    const repository = repositoryWithSnapshot();
    const exported = await exportCompetition(repository, { scope: "all" });
    const zip = await JSZip.loadAsync(exported.buffer);
    expect(Object.keys(zip.files)).toHaveLength(1);
    expect(Object.keys(zip.files)[0]).toContain("智能创作");
    repository.close();
  });
});
