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
    expect(response.json()).toMatchObject({
      collectionMode: "manual-only",
      freshness: "empty",
      freshnessSettings: { staleAfterSeconds: 120, criticalAfterSeconds: 300 },
    });
  });

  it("updates the persisted last-success time without duplicating an unchanged snapshot", async () => {
    await app.inject({
      method: "PUT",
      url: "/api/event-rules",
      payload: { rules: [{ event: "智能创作", minScore: "0", maxScore: "100", enabled: true }] },
    });
    const request = { format: "clipboard", text, mapping };
    const preview = await app.inject({ method: "POST", url: "/api/import/preview", payload: request });
    const expectedHash = preview.json<{ hash: string }>().hash;
    const first = await app.inject({
      method: "POST",
      url: "/api/import/publish",
      payload: { ...request, expectedHash },
    });
    const firstPayload = first.json<{ snapshot: { id: string; createdAt: string }; syncRun: { finishedAt: string } }>();
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await app.inject({
      method: "POST",
      url: "/api/import/publish",
      payload: { ...request, expectedHash },
    });
    const secondPayload = second.json<{ created: boolean; snapshot: { id: string; createdAt: string }; syncRun: { finishedAt: string } }>();
    expect(secondPayload.created).toBe(false);
    expect(secondPayload.snapshot.id).toBe(firstPayload.snapshot.id);
    expect(secondPayload.snapshot.createdAt).toBe(firstPayload.snapshot.createdAt);
    expect(secondPayload.syncRun.finishedAt).not.toBe(firstPayload.syncRun.finishedAt);
    const status = await app.inject({ method: "GET", url: "/api/status" });
    expect(status.json<{ lastSuccessAt: string }>().lastSuccessAt).toBe(secondPayload.syncRun.finishedAt);
    expect(repository.listSnapshots()).toHaveLength(1);
    expect(repository.listSyncRuns()).toHaveLength(2);
  });

  it("records failed publication attempts without replacing the current snapshot", async () => {
    repository.replaceEventRules([{ event: "智能创作", minScore: "0", maxScore: "100", enabled: true }]);
    const request = { format: "clipboard", text, mapping };
    const preview = await app.inject({ method: "POST", url: "/api/import/preview", payload: request });
    const expectedHash = preview.json<{ hash: string }>().hash;
    await app.inject({ method: "POST", url: "/api/import/publish", payload: { ...request, expectedHash } });
    const currentId = repository.getCurrent()?.summary.id;
    const failed = await app.inject({ method: "POST", url: "/api/import/publish", payload: request });
    expect(failed.json()).toEqual({ error: { code: "IMPORT_PREVIEW_REQUIRED" } });
    expect(repository.getCurrent()?.summary.id).toBe(currentId);
    expect(repository.listSyncRuns()[0]).toMatchObject({
      state: "failed",
      errorCode: "IMPORT_PREVIEW_REQUIRED",
      recordCount: 4,
    });
  });

  it("validates configurable freshness thresholds", async () => {
    const saved = await app.inject({
      method: "PUT",
      url: "/api/settings/freshness",
      payload: { staleAfterSeconds: 180, criticalAfterSeconds: 600 },
    });
    expect(saved.json()).toEqual({ staleAfterSeconds: 180, criticalAfterSeconds: 600 });
    const invalid = await app.inject({
      method: "PUT",
      url: "/api/settings/freshness",
      payload: { staleAfterSeconds: 600, criticalAfterSeconds: 180 },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toEqual({ error: { code: "INPUT_SCHEMA_INVALID" } });
  });

  it("views and compares immutable snapshots without exposing sensitive columns", async () => {
    repository.replaceEventRules([{ event: "智能创作", minScore: "0", maxScore: "100", enabled: true }]);
    const publish = async (candidateText: string) => {
      const request = { format: "clipboard", text: candidateText, mapping };
      const preview = await app.inject({ method: "POST", url: "/api/import/preview", payload: request });
      const expectedHash = preview.json<{ hash: string }>().hash;
      return app.inject({ method: "POST", url: "/api/import/publish", payload: { ...request, expectedHash } });
    };
    const first = await publish(text);
    const second = await publish(text.replace("虚构甲\t98", "虚构甲\t99"));
    const firstId = first.json<{ snapshot: { id: string } }>().snapshot.id;
    const secondId = second.json<{ snapshot: { id: string } }>().snapshot.id;
    const detail = await app.inject({ method: "GET", url: `/api/snapshots/${firstId}` });
    expect(detail.statusCode).toBe(200);
    expect(detail.body).not.toContain("00000000000");
    expect(detail.body).not.toContain("TEST-ID-A");
    expect(detail.json<{ summary: { fieldVersion: string } }>().summary.fieldVersion).toBe("canonical-v1");
    const comparison = await app.inject({
      method: "GET",
      url: `/api/snapshots/compare?base=${firstId}&target=${secondId}`,
    });
    expect(comparison.json()).toMatchObject({
      summary: { added: 0, removed: 0, changed: 1, totalChanges: 1 },
      changes: [{ type: "changed", participantName: "虚构甲" }],
    });

    const [header, ...sourceRows] = text.split("\n");
    const inserted = await publish([
      header,
      "东部赛区\t智能创作\t小学组\t虚构新增\t50\t00000000004\tTEST-ID-E",
      ...sourceRows,
    ].join("\n"));
    const insertedId = inserted.json<{ snapshot: { id: string } }>().snapshot.id;
    const insertionComparison = await app.inject({
      method: "GET",
      url: `/api/snapshots/compare?base=${firstId}&target=${insertedId}`,
    });
    expect(insertionComparison.json()).toMatchObject({
      summary: { added: 1, removed: 0, changed: 0, unchanged: 4, totalChanges: 1 },
      changes: [{ type: "added", participantName: "虚构新增" }],
    });
  });

  it("restores the latest failure and prior success time after a server restart", async () => {
    const secondaryRepository = new CompetitionRepository({ path: ":memory:", encryptionKey: Buffer.alloc(32, 11) });
    const firstServer = await buildServer({ repository: secondaryRepository, logger: false });
    try {
      await firstServer.inject({
        method: "PUT",
        url: "/api/event-rules",
        payload: { rules: [{ event: "智能创作", minScore: "0", maxScore: "100", enabled: true }] },
      });
      const request = { format: "clipboard", text, mapping };
      const preview = await firstServer.inject({ method: "POST", url: "/api/import/preview", payload: request });
      const expectedHash = preview.json<{ hash: string }>().hash;
      await firstServer.inject({ method: "POST", url: "/api/import/publish", payload: { ...request, expectedHash } });
      await firstServer.inject({ method: "POST", url: "/api/import/publish", payload: request });
    } finally {
      await firstServer.close();
    }

    const restarted = await buildServer({ repository: secondaryRepository, logger: false });
    try {
      const response = await restarted.inject({ method: "GET", url: "/api/status" });
      expect(response.json()).toMatchObject({
        state: "failed",
        lastErrorCode: "IMPORT_PREVIEW_REQUIRED",
        collectionMode: "manual-only",
      });
      expect(response.json<{ lastSuccessAt: string | null }>().lastSuccessAt).not.toBeNull();
    } finally {
      await restarted.close();
      secondaryRepository.close();
    }
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
