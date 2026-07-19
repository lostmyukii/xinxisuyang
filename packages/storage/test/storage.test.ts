import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { RankingResult, SourceRecord } from "@xinxisuyang/domain";
import { ColumnCipher, CompetitionRepository } from "../src/index.js";

const key = Buffer.alloc(32, 7);
const rules = [{ event: "智能创作", minScore: "0", maxScore: "120", enabled: true }];
const records: SourceRecord[] = [
  {
    sourceRecordId: "r-1",
    sourceIndex: 0,
    region: "东部赛区",
    event: "智能创作",
    group: "小学组",
    participantName: "虚构选手",
    scoreRaw: "96.80",
    phone: "00000000000",
    idNumber: "TEST-ID-ONLY",
    sourceFields: {},
  },
];
const result: RankingResult = {
  rows: [
    {
      sourceRecordId: "r-1",
      sourceIndex: 0,
      region: "东部赛区",
      event: "智能创作",
      group: "小学组",
      participantName: "虚构选手",
      score: "96.80",
      rank: 1,
      status: "valid",
    },
  ],
  issues: [],
  inputCount: 1,
  partitionCount: 1,
};

describe("ColumnCipher", () => {
  it("round trips sensitive values without storing plaintext", () => {
    const cipher = new ColumnCipher(key);
    const encrypted = cipher.encrypt("TEST-SENSITIVE-VALUE");
    expect(encrypted).not.toContain("TEST-SENSITIVE-VALUE");
    expect(cipher.decrypt(encrypted)).toBe("TEST-SENSITIVE-VALUE");
  });
});

describe("CompetitionRepository", () => {
  it("publishes atomically and deduplicates unchanged content", () => {
    const repository = new CompetitionRepository({ path: ":memory:", encryptionKey: key });
    const first = repository.publish({ records, result, rules, source: "manual" });
    const second = repository.publish({ records, result, rules, source: "manual" });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.snapshot.id).toBe(first.snapshot.id);
    expect(repository.getCurrent()?.rows).toEqual(result.rows);
    expect(repository.listSnapshots()).toHaveLength(1);
    repository.close();
  });

  it("keeps the previous snapshot when a transaction fails", () => {
    const repository = new CompetitionRepository({ path: ":memory:", encryptionKey: key });
    const first = repository.publish({ records, result, rules, source: "manual" });
    const changed = [{ ...records[0]!, scoreRaw: "97" }];

    expect(() =>
      repository.publish({
        records: changed,
        result: { ...result, rows: [{ ...result.rows[0]!, score: "97" }] },
        rules,
        source: "manual",
        beforeCommit: () => {
          throw new Error("TEST_WRITE_FAILURE");
        },
      }),
    ).toThrow("TEST_WRITE_FAILURE");

    expect(repository.getCurrent()?.summary.id).toBe(first.snapshot.id);
    expect(repository.listSnapshots()).toHaveLength(1);
    repository.close();
  });

  it("validates and replaces event rules", () => {
    const repository = new CompetitionRepository({ path: ":memory:", encryptionKey: key });
    repository.replaceEventRules([
      { event: "智能创作", minScore: "0", maxScore: "120", enabled: true },
    ]);
    expect(repository.listEventRules()).toEqual([
      { event: "智能创作", minScore: "0", maxScore: "120", enabled: true },
    ]);
    repository.close();
  });

  it("creates a new snapshot when scoring rules change even if visible ranks stay equal", () => {
    const repository = new CompetitionRepository({ path: ":memory:", encryptionKey: key });
    const first = repository.publish({ records, result, rules, source: "manual" });
    const changedRules = [{ ...rules[0]!, maxScore: "121" }];
    const second = repository.publish({ records, result, rules: changedRules, source: "manual" });
    expect(second.created).toBe(true);
    expect(second.snapshot.id).not.toBe(first.snapshot.id);
    expect(second.snapshot.fieldVersion).toBe("canonical-v1");
    repository.close();
  });

  it("rolls back rules and ranking together when a rule-change publication fails", () => {
    const repository = new CompetitionRepository({ path: ":memory:", encryptionKey: key });
    repository.replaceEventRules(rules);
    const first = repository.publish({ records, result, rules, source: "manual" });
    const changedRules = [{ ...rules[0]!, maxScore: "121" }];
    expect(() => repository.replaceEventRulesAndPublish(changedRules, {
      records,
      result,
      source: "manual",
      beforeCommit: () => {
        throw new Error("TEST_RULE_REPUBLISH_FAILURE");
      },
    })).toThrow("TEST_RULE_REPUBLISH_FAILURE");
    expect(repository.listEventRules()).toEqual(rules);
    expect(repository.getCurrent()?.summary.id).toBe(first.snapshot.id);
    expect(repository.listSnapshots()).toHaveLength(1);
    repository.close();
  });

  it("rejects duplicate event rule names before writing", () => {
    const repository = new CompetitionRepository({ path: ":memory:", encryptionKey: key });
    expect(() => repository.replaceEventRules([rules[0]!, { ...rules[0]! }])).toThrow("EVENT_RULE_DUPLICATE");
    expect(repository.listEventRules()).toEqual([]);
    repository.close();
  });

  it("persists freshness settings and successful or failed sync runs", () => {
    const repository = new CompetitionRepository({ path: ":memory:", encryptionKey: key });
    expect(repository.getFreshnessSettings()).toEqual({ staleAfterSeconds: 120, criticalAfterSeconds: 300 });
    expect(repository.replaceFreshnessSettings({ staleAfterSeconds: 180, criticalAfterSeconds: 600 })).toEqual({
      staleAfterSeconds: 180,
      criticalAfterSeconds: 600,
    });
    const succeeded = repository.startSyncRun("manual", new Date("2026-07-19T10:00:00.000Z"));
    repository.finishSyncRun(succeeded.id, {
      state: "succeeded",
      recordCount: 1,
      errorCode: null,
      now: new Date("2026-07-19T10:00:01.000Z"),
    });
    const failed = repository.startSyncRun("manual", new Date("2026-07-19T10:01:00.000Z"));
    repository.finishSyncRun(failed.id, {
      state: "failed",
      recordCount: null,
      errorCode: "IMPORT_PREVIEW_REQUIRED",
      now: new Date("2026-07-19T10:01:01.000Z"),
    });
    expect(repository.listSyncRuns()).toMatchObject([
      { id: failed.id, state: "failed", errorCode: "IMPORT_PREVIEW_REQUIRED" },
      { id: succeeded.id, state: "succeeded", recordCount: 1 },
    ]);
    expect(repository.getLatestSuccessfulSyncRun()?.id).toBe(succeeded.id);
    repository.close();
  });

  it("marks an interrupted running attempt as failed on the next startup", () => {
    const repository = new CompetitionRepository({ path: ":memory:", encryptionKey: key });
    const running = repository.startSyncRun("manual", new Date("2026-07-19T10:00:00.000Z"));
    expect(repository.failInterruptedSyncRuns(new Date("2026-07-19T10:02:00.000Z"))).toBe(1);
    expect(repository.listSyncRuns()[0]).toMatchObject({
      id: running.id,
      state: "failed",
      finishedAt: "2026-07-19T10:02:00.000Z",
      errorCode: "SYNC_RUN_INTERRUPTED",
    });
    repository.close();
  });

  it("prunes non-current snapshots older than 30 days while preserving current data", () => {
    const repository = new CompetitionRepository({ path: ":memory:", encryptionKey: key });
    const first = repository.publish({
      records,
      result,
      rules,
      source: "manual",
      now: new Date("2026-01-01T00:00:00.000Z"),
    });
    const changed = [{ ...records[0]!, scoreRaw: "97" }];
    const second = repository.publish({
      records: changed,
      result: { ...result, rows: [{ ...result.rows[0]!, score: "97" }] },
      rules,
      source: "manual",
      now: new Date("2026-02-01T00:00:01.000Z"),
    });
    expect(repository.getSnapshot(first.snapshot.id)).toBeNull();
    expect(repository.getCurrent()?.summary.id).toBe(second.snapshot.id);
    expect(repository.listSnapshots()).toHaveLength(1);
    repository.close();
  });

  it("applies retention even when a successful publication reuses the current snapshot", () => {
    const repository = new CompetitionRepository({ path: ":memory:", encryptionKey: key });
    repository.publish({
      records,
      result,
      rules,
      source: "manual",
      now: new Date("2026-01-01T00:00:00.000Z"),
    });
    const changed = [{ ...records[0]!, scoreRaw: "97" }];
    const changedResult = { ...result, rows: [{ ...result.rows[0]!, score: "97" }] };
    const current = repository.publish({
      records: changed,
      result: changedResult,
      rules,
      source: "manual",
      now: new Date("2026-01-02T00:00:00.000Z"),
    });
    const reused = repository.publish({
      records: changed,
      result: changedResult,
      rules,
      source: "manual",
      now: new Date("2026-02-02T00:00:01.000Z"),
    });
    expect(reused).toMatchObject({ created: false, snapshot: { id: current.snapshot.id } });
    expect(repository.listSnapshots()).toHaveLength(1);
    repository.close();
  });

  it("restores an immutable historical snapshot", () => {
    const repository = new CompetitionRepository({ path: ":memory:", encryptionKey: key });
    const first = repository.publish({ records, result, rules, source: "manual" });
    const changed = [{ ...records[0]!, scoreRaw: "97" }];
    const second = repository.publish({
      records: changed,
      result: { ...result, rows: [{ ...result.rows[0]!, score: "97" }] },
      rules,
      source: "manual",
    });
    expect(repository.getCurrent()?.summary.id).toBe(second.snapshot.id);
    expect(repository.restoreSnapshot(first.snapshot.id).summary.id).toBe(first.snapshot.id);
    expect(() =>
      repository.publish({
        records: changed,
        result: { ...result, rows: [{ ...result.rows[0]!, score: "97" }] },
        rules,
        source: "manual",
        beforeCommit: () => {
          throw new Error("TEST_REUSE_FAILURE");
        },
      }),
    ).toThrow("TEST_REUSE_FAILURE");
    expect(repository.getCurrent()?.summary.id).toBe(first.snapshot.id);
    const reused = repository.publish({
      records: changed,
      result: { ...result, rows: [{ ...result.rows[0]!, score: "97" }] },
      rules,
      source: "manual",
    });
    expect(reused).toMatchObject({ created: false, snapshot: { id: second.snapshot.id } });
    expect(repository.getCurrent()?.summary.id).toBe(second.snapshot.id);
    expect(repository.listSnapshots()).toHaveLength(2);
    repository.close();
  });

  it("never writes phone or identity values as plaintext in SQLite files", () => {
    const directory = mkdtempSync(join(tmpdir(), "xinxisuyang-storage-"));
    const databasePath = join(directory, "competition.sqlite");
    try {
      const repository = new CompetitionRepository({ path: databasePath, encryptionKey: key });
      repository.publish({ records, result, rules, source: "manual" });
      repository.close();
      const storedBytes = Buffer.concat(
        readdirSync(directory).map((file) => readFileSync(join(directory, file))),
      ).toString("utf8");
      expect(storedBytes).not.toContain("00000000000");
      expect(storedBytes).not.toContain("TEST-ID-ONLY");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("upgrades an existing version-1 database without losing compatibility", () => {
    const directory = mkdtempSync(join(tmpdir(), "xinxisuyang-migration-"));
    const databasePath = join(directory, "competition.sqlite");
    try {
      const legacy = new DatabaseSync(databasePath);
      legacy.exec(`
        CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
        INSERT INTO schema_migrations(version, applied_at) VALUES (1, '2026-07-19T00:00:00.000Z');
        CREATE TABLE snapshots (
          id TEXT PRIMARY KEY,
          created_at TEXT NOT NULL,
          source TEXT NOT NULL,
          content_hash TEXT NOT NULL,
          record_count INTEGER NOT NULL,
          valid_count INTEGER NOT NULL,
          issue_count INTEGER NOT NULL,
          is_current INTEGER NOT NULL DEFAULT 0
        );
      `);
      legacy.close();

      const repository = new CompetitionRepository({ path: databasePath, encryptionKey: key });
      expect(repository.getFreshnessSettings()).toEqual({ staleAfterSeconds: 120, criticalAfterSeconds: 300 });
      expect(repository.publish({ records, result, rules, source: "manual" }).snapshot.fieldVersion).toBe("canonical-v1");
      repository.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
