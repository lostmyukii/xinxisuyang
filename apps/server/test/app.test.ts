import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { CompetitionRepository } from "@xinxisuyang/storage";
import { buildServer } from "../src/app.js";

const mapping = {
  region: "赛区",
  event: "赛项",
  group: "组别",
  participantName: "选手姓名",
  scoreRaw: "成绩",
  phone: "手机号",
  idNumber: "身份证号",
};
const text = [
  "赛区\t赛项\t组别\t选手姓名\t成绩\t手机号\t身份证号",
  "东部赛区\t智能创作\t小学组\t虚构甲\t98\t00000000000\tTEST-ID-A",
  "东部赛区\t智能创作\t小学组\t虚构乙\t96.8\t00000000001\tTEST-ID-B",
  "东部赛区\t智能创作\t小学组\t虚构丙\t96.80\t00000000002\tTEST-ID-C",
  "东部赛区\t智能创作\t小学组\t虚构丁\t异常\t00000000003\tTEST-ID-D",
].join("\n");

describe("local API", () => {
  let repository: CompetitionRepository;
  let app: FastifyInstance;

  beforeEach(async () => {
    repository = new CompetitionRepository({ path: ":memory:", encryptionKey: Buffer.alloc(32, 9) });
    app = await buildServer({ repository, pairingToken: "test-probe-token", logger: false });
  });

  afterEach(async () => {
    await app.close();
    repository.close();
  });

  it("requires preview before atomic publication", async () => {
    await app.inject({
      method: "PUT",
      url: "/api/event-rules",
      payload: { rules: [{ event: "智能创作", minScore: "0", maxScore: "100", enabled: true }] },
    });
    const request = { format: "clipboard", text, mapping };
    const previewResponse = await app.inject({ method: "POST", url: "/api/import/preview", payload: request });
    expect(previewResponse.statusCode).toBe(200);
    const preview = previewResponse.json<{
      hash: string;
      recordCount: number;
      validCount: number;
      issueCount: number;
    }>();
    expect(preview).toMatchObject({ recordCount: 4, validCount: 3, issueCount: 1 });

    const withoutPreview = await app.inject({ method: "POST", url: "/api/import/publish", payload: request });
    expect(withoutPreview.json()).toEqual({ error: { code: "IMPORT_PREVIEW_REQUIRED" } });

    const publish = await app.inject({
      method: "POST",
      url: "/api/import/publish",
      payload: { ...request, expectedHash: preview.hash },
    });
    expect(publish.statusCode).toBe(200);
    expect(publish.json<{ result: { rows: Array<{ rank: number }> } }>().result.rows.map((row) => row.rank)).toEqual([
      1,
      2,
      2,
    ]);
  });

  it("never sends sensitive values to the display endpoint", async () => {
    repository.replaceEventRules([{ event: "智能创作", minScore: "0", maxScore: "100", enabled: true }]);
    const request = { format: "clipboard", text, mapping };
    const preview = await app.inject({ method: "POST", url: "/api/import/preview", payload: request });
    const hash = preview.json<{ hash: string }>().hash;
    await app.inject({
      method: "POST",
      url: "/api/import/publish",
      payload: { ...request, expectedHash: hash },
    });

    const response = await app.inject({ method: "GET", url: "/api/display" });
    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain("00000000000");
    expect(response.body).not.toContain("TEST-ID-A");
    expect(response.body).not.toContain("虚构甲");
    expect(response.json<{ rows: Array<{ participantName: string }> }>().rows[0]?.participantName).toBe("虚*甲");
  });

  it("reports manual-only mode honestly", async () => {
    const response = await app.inject({ method: "GET", url: "/api/status" });
    expect(response.json()).toMatchObject({ collectionMode: "manual-only", freshness: "empty" });
  });

  it("accepts only paired, privacy-safe probe metadata", async () => {
    const report = {
      documentPathHash: "a".repeat(64),
      observedAt: "2026-07-19T06:00:00.000Z",
      structure: {
        canvasCount: 2,
        iframeCount: 0,
        tableCount: 0,
        editableCount: 1,
        hasWorkbookGlobal: true,
      },
      extraction: {
        status: "STRUCTURE_ONLY",
        fieldCount: null,
        recordCount: null,
        fieldNamesHash: null,
        recordIdsHash: null,
        contentHash: null,
      },
    };
    const rejected = await app.inject({ method: "POST", url: "/api/probe/report", payload: report });
    expect(rejected.statusCode).toBe(401);

    const accepted = await app.inject({
      method: "POST",
      url: "/api/probe/report",
      headers: { "x-competition-token": "test-probe-token" },
      payload: report,
    });
    expect(accepted.statusCode).toBe(200);
    const status = await app.inject({ method: "GET", url: "/api/probe/status" });
    expect(status.json()).toMatchObject({ conclusion: "incomplete", latest: report });
    expect(status.body).not.toContain("kdocs.cn/office");
  });
});
