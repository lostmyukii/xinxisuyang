import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import type { SourceRecord } from "@xinxisuyang/domain";
import { rankCompetition } from "@xinxisuyang/ranking";
import { CompetitionRepository } from "@xinxisuyang/storage";
import { exportCompetition } from "../src/export/service.js";

const rules = [{ event: "智能创作", minScore: "0", maxScore: "120", enabled: true }];

function records(count: number): SourceRecord[] {
  return Array.from({ length: count }, (_, index) => ({
    sourceRecordId: `performance-${index}`,
    sourceIndex: index,
    region: `赛区${index % 4}`,
    event: "智能创作",
    group: `组别${index % 3}`,
    participantName: `合成选手${index + 1}`,
    scoreRaw: `${60 + (index % 60)}.${String(index % 100).padStart(2, "0")}`,
    sourceFields: {},
  }));
}

describe("ranking and snapshot performance", () => {
  it.each([501, 5_000])("commits %i synthetic records in under one second", (count) => {
    const repository = new CompetitionRepository({ path: ":memory:", encryptionKey: Buffer.alloc(32, 17) });
    const source = records(count);
    const startedAt = performance.now();
    const result = rankCompetition(source, rules);
    repository.publish({ records: source, result, rules, source: "manual" });
    const elapsedMilliseconds = performance.now() - startedAt;
    expect(result.rows).toHaveLength(count);
    expect(repository.getCurrent()?.summary.recordCount).toBe(count);
    expect(elapsedMilliseconds).toBeLessThan(1_000);
    repository.close();
  });

  it("exports 5,000 ranked records without blocking the browser client", async () => {
    const repository = new CompetitionRepository({ path: ":memory:", encryptionKey: Buffer.alloc(32, 18) });
    const source = records(5_000);
    repository.publish({ records: source, result: rankCompetition(source, rules), rules, source: "manual" });
    const startedAt = performance.now();
    const exported = await exportCompetition(repository, { scope: "event", event: "智能创作" });
    const elapsedMilliseconds = performance.now() - startedAt;
    expect(exported.buffer.byteLength).toBeGreaterThan(100_000);
    expect(elapsedMilliseconds).toBeLessThan(10_000);
    repository.close();
  }, 15_000);
});
