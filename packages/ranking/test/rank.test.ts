import { describe, expect, it } from "vitest";
import type { EventRule, SourceRecord } from "@xinxisuyang/domain";
import { rankCompetition } from "../src/index.js";

const rules: EventRule[] = [
  { event: "智能创作", minScore: "0", maxScore: "120", enabled: true },
  { event: "算法挑战", minScore: "60", maxScore: "100", enabled: true },
];

function record(
  sourceIndex: number,
  scoreRaw: string,
  overrides: Partial<SourceRecord> = {},
): SourceRecord {
  return {
    sourceRecordId: `record-${sourceIndex}`,
    sourceIndex,
    region: "东部赛区",
    event: "智能创作",
    group: "小学组",
    participantName: `选手${sourceIndex}`,
    scoreRaw,
    sourceFields: {},
    ...overrides,
  };
}

describe("rankCompetition", () => {
  it("uses standard competition ranking and exact decimal equality", () => {
    const result = rankCompetition(
      [record(0, "98"), record(1, "96.8"), record(2, "96.80"), record(3, "93.10")],
      rules,
    );

    expect(result.rows.map(({ score, rank }) => [score, rank])).toEqual([
      ["98", 1],
      ["96.8", 2],
      ["96.80", 2],
      ["93.10", 4],
    ]);
  });

  it("never mixes region, event, or group partitions", () => {
    const result = rankCompetition(
      [
        record(0, "90"),
        record(1, "80", { region: "西部赛区" }),
        record(2, "70", { group: "初中组" }),
        record(3, "95", { event: "算法挑战" }),
      ],
      rules,
    );

    expect(result.partitionCount).toBe(4);
    expect(result.rows.every((row) => row.rank === 1)).toBe(true);
  });

  it("excludes invalid scores and reports exact reasons", () => {
    const result = rankCompetition(
      [
        record(0, ""),
        record(1, "优秀"),
        record(2, "100.001"),
        record(3, "121"),
        record(4, "80", { event: "未配置赛项" }),
        record(5, "80", { participantName: "" }),
      ],
      rules,
    );

    expect(result.rows).toHaveLength(0);
    expect(result.issues.map((issue) => issue.code)).toEqual([
      "SCORE_REQUIRED",
      "SCORE_NOT_NUMERIC",
      "SCORE_PRECISION_EXCEEDED",
      "SCORE_OUT_OF_RANGE",
      "EVENT_RULE_MISSING",
      "RECORD_INCOMPLETE",
    ]);
  });

  it("keeps source order for ties", () => {
    const result = rankCompetition([record(7, "95"), record(2, "95"), record(4, "95")], rules);
    expect(result.rows.map((row) => row.sourceIndex)).toEqual([2, 4, 7]);
    expect(result.rows.map((row) => row.rank)).toEqual([1, 1, 1]);
  });

  it("ranks 5,000 synthetic records deterministically", () => {
    const records = Array.from({ length: 5_000 }, (_, index) =>
      record(index, `${60 + (index % 60)}.${String(index % 100).padStart(2, "0")}`, {
        region: `赛区${index % 4}`,
        group: `组别${index % 3}`,
      }),
    );

    const first = rankCompetition(records, rules);
    const second = rankCompetition(records, rules);
    expect(first).toEqual(second);
    expect(first.inputCount).toBe(5_000);
    expect(first.partitionCount).toBe(12);
    expect(first.issues).toHaveLength(0);
  });
});
