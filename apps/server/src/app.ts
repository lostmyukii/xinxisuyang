import cors from "@fastify/cors";
import Fastify from "fastify";
import { z } from "zod";
import {
  eventRuleSchema,
  getFreshness,
  issueMessages,
  toDisplayRankingRow,
} from "@xinxisuyang/domain";
import type { CompetitionRepository } from "@xinxisuyang/storage";
import { rankCompetition } from "@xinxisuyang/ranking";
import { errorCode, handleError } from "./errors.js";
import { exportCompetition } from "./export/service.js";
import { importRequestSchema, prepareImport } from "./import/request.js";
import { probeReportSchema } from "./probe/schema.js";
import { ProbeStore } from "./probe/store.js";
import { SyncStatusStore } from "./sync/status.js";

export interface ServerDependencies {
  repository: CompetitionRepository;
  pairingToken?: string;
  logger?: boolean;
  webOrigins?: readonly string[];
}

const filterSchema = z.object({
  region: z.string().optional(),
  event: z.string().optional(),
  group: z.string().optional(),
  search: z.string().optional(),
});

export async function buildServer(dependencies: ServerDependencies) {
  const app = Fastify({
    logger: dependencies.logger === false ? false : {
      redact: ["req.headers.authorization", "req.headers.x-competition-token", "body.text", "body.base64"],
    },
    bodyLimit: 15 * 1024 * 1024,
  });
  const origins = new Set(
    dependencies.webOrigins ?? ["http://127.0.0.1:4173", "http://127.0.0.1:5173"],
  );
  const status = new SyncStatusStore();
  const probe = new ProbeStore();
  const currentAtStart = dependencies.repository.getCurrent();
  if (currentAtStart !== null) status.succeed(currentAtStart.summary);

  await app.register(cors, {
    origin(origin, callback) {
      if (origin === undefined || origins.has(origin)) callback(null, true);
      else callback(new Error("ORIGIN_NOT_ALLOWED"), false);
    },
    methods: ["GET", "PUT", "POST"],
    exposedHeaders: ["content-disposition"],
  });
  app.setErrorHandler(handleError);

  app.get("/health", () => ({ ok: true, service: "competition-console" }));

  app.get("/api/status", () => {
    const current = dependencies.repository.getCurrent();
    const state = status.get();
    return {
      ...state,
      freshness: getFreshness(state.lastSuccessAt),
      counts:
        current === null
          ? { records: 0, valid: 0, issues: 0 }
          : {
              records: current.summary.recordCount,
              valid: current.summary.validCount,
              issues: current.summary.issueCount,
            },
      collectionMode: "manual-only",
      collectionMessage: "自动采集尚未通过真实 Chrome 验证，请使用手动导入",
    };
  });

  app.get("/api/event-rules", () => ({ rules: dependencies.repository.listEventRules() }));
  app.put("/api/event-rules", (request) => {
    const body = z.object({ rules: z.array(eventRuleSchema).max(500) }).parse(request.body);
    const rules = dependencies.repository.replaceEventRules(body.rules);
    const current = dependencies.repository.getCurrent();
    const records = dependencies.repository.getCurrentSourceRecords();
    let snapshot = current?.summary ?? null;
    if (current !== null && records.length > 0) {
      const published = dependencies.repository.publish({
        records,
        result: rankCompetition(records, rules),
        source: current.summary.source,
      });
      snapshot = published.snapshot;
      status.succeed(published.snapshot);
    }
    dependencies.repository.recordAudit("event-rules.replaced", snapshot?.id ?? null, { ruleCount: rules.length });
    return { rules, snapshot };
  });

  app.post("/api/probe/report", (request, reply) => {
    const expectedToken = dependencies.pairingToken;
    const token = request.headers["x-competition-token"];
    if (expectedToken === undefined || token !== expectedToken) {
      return reply.status(401).send({ error: { code: "PROBE_PAIRING_REQUIRED" } });
    }
    const report = probeReportSchema.parse(request.body);
    probe.set(report);
    return { accepted: true, extractionStatus: report.extraction.status };
  });

  app.get("/api/probe/status", () => {
    const latest = probe.get();
    return {
      conclusion: latest?.extraction.status === "COMPLETE_RECORDS" ? "pending-validation" : "incomplete",
      latest,
      message:
        latest === null
          ? "尚未收到 Chrome 扩展探针结果"
          : "当前只完成页面结构探测，尚未证明完整记录读取",
    };
  });

  app.post("/api/import/preview", async (request) => {
    const candidate = await prepareImport(request.body, dependencies.repository.listEventRules());
    return {
      headers: candidate.headers,
      hash: candidate.hash,
      ...candidate.preview,
      issues: candidate.result.issues.slice(0, 100).map((issue) => ({
        ...issue,
        participantName: issue.participantName.length === 0 ? "—" : "已脱敏",
        message: issueMessages[issue.code],
      })),
    };
  });

  app.post("/api/import/publish", async (request) => {
    const parsed = importRequestSchema.parse(request.body);
    status.begin();
    try {
      const candidate = await prepareImport(parsed, dependencies.repository.listEventRules());
      if (parsed.expectedHash === undefined) throw new Error("IMPORT_PREVIEW_REQUIRED");
      if (candidate.hash !== parsed.expectedHash) throw new Error("IMPORT_CANDIDATE_CHANGED");
      const published = dependencies.repository.publish({
        records: candidate.records,
        result: candidate.result,
        source: "manual",
      });
      status.succeed(published.snapshot);
      return { ...published, result: candidate.result };
    } catch (error) {
      status.fail(errorCode(error));
      throw error;
    }
  });

  app.get("/api/rankings", async (request, reply) => {
    const filters = filterSchema.parse(request.query);
    const current = dependencies.repository.getCurrent();
    if (current === null) return reply.status(404).send({ error: { code: "SNAPSHOT_NOT_FOUND" } });
    const search = filters.search?.trim().toLocaleLowerCase("zh-CN");
    const rows = current.rows.filter(
      (row) =>
        (filters.region === undefined || row.region === filters.region) &&
        (filters.event === undefined || row.event === filters.event) &&
        (filters.group === undefined || row.group === filters.group) &&
        (search === undefined || row.participantName.toLocaleLowerCase("zh-CN").includes(search)),
    );
    return { snapshot: current.summary, rows };
  });

  app.get("/api/issues", async (_request, reply) => {
    const current = dependencies.repository.getCurrent();
    if (current === null) return reply.status(404).send({ error: { code: "SNAPSHOT_NOT_FOUND" } });
    return {
      snapshot: current.summary,
      issues: current.issues.map((issue) => ({ ...issue, message: issueMessages[issue.code] })),
    };
  });

  app.get("/api/display", async (_request, reply) => {
    const current = dependencies.repository.getCurrent();
    if (current === null) return reply.status(404).send({ error: { code: "SNAPSHOT_NOT_FOUND" } });
    return {
      snapshotId: current.summary.id,
      lastSuccessAt: current.summary.createdAt,
      freshness: getFreshness(current.summary.createdAt),
      rows: current.rows.map(toDisplayRankingRow),
    };
  });

  app.get("/api/snapshots", () => ({ snapshots: dependencies.repository.listSnapshots() }));
  app.post("/api/snapshots/:id/restore", (request) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const restored = dependencies.repository.restoreSnapshot(params.id);
    status.succeed(restored.summary);
    return restored;
  });
  app.post("/api/exports", async (request, reply) => {
    const exported = await exportCompetition(dependencies.repository, request.body);
    return reply
      .header("content-type", exported.contentType)
      .header("content-disposition", `attachment; filename*=UTF-8''${encodeURIComponent(exported.filename)}`)
      .send(exported.buffer);
  });
  return app;
}
