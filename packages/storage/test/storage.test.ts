import { describe, expect, it } from "vitest";
import type { RankingResult, SourceRecord } from "@xinxisuyang/domain";
import { ColumnCipher, CompetitionRepository } from "../src/index.js";

const key = Buffer.alloc(32, 7);
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
    const first = repository.publish({ records, result, source: "manual" });
    const second = repository.publish({ records, result, source: "manual" });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.snapshot.id).toBe(first.snapshot.id);
    expect(repository.getCurrent()?.rows).toEqual(result.rows);
    expect(repository.listSnapshots()).toHaveLength(1);
    repository.close();
  });

  it("keeps the previous snapshot when a transaction fails", () => {
    const repository = new CompetitionRepository({ path: ":memory:", encryptionKey: key });
    const first = repository.publish({ records, result, source: "manual" });
    const changed = [{ ...records[0]!, scoreRaw: "97" }];

    expect(() =>
      repository.publish({
        records: changed,
        result: { ...result, rows: [{ ...result.rows[0]!, score: "97" }] },
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

  it("restores an immutable historical snapshot", () => {
    const repository = new CompetitionRepository({ path: ":memory:", encryptionKey: key });
    const first = repository.publish({ records, result, source: "manual" });
    const changed = [{ ...records[0]!, scoreRaw: "97" }];
    const second = repository.publish({
      records: changed,
      result: { ...result, rows: [{ ...result.rows[0]!, score: "97" }] },
      source: "manual",
    });
    expect(repository.getCurrent()?.summary.id).toBe(second.snapshot.id);
    expect(repository.restoreSnapshot(first.snapshot.id).summary.id).toBe(first.snapshot.id);
    expect(repository.listSnapshots()).toHaveLength(2);
    repository.close();
  });
});
