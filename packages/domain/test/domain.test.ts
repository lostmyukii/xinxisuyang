import { describe, expect, it } from "vitest";
import {
  displayRankingRowSchema,
  eventRuleSchema,
  getFreshness,
  maskParticipantName,
  toDisplayRankingRow,
} from "../src/index.js";

describe("eventRuleSchema", () => {
  it("requires an explicit valid range", () => {
    expect(eventRuleSchema.safeParse({ event: "编程", minScore: "60", maxScore: "100" }).success).toBe(true);
    expect(eventRuleSchema.safeParse({ event: "编程", minScore: "100", maxScore: "60" }).success).toBe(false);
    expect(eventRuleSchema.safeParse({ event: "编程", minScore: "0", maxScore: "100.001" }).success).toBe(false);
  });
});

describe("privacy-safe display DTO", () => {
  it.each([
    ["", "—"],
    ["李", "*"],
    ["李明", "李*"],
    ["欧阳明", "欧*明"],
    ["欧阳小明", "欧**明"],
  ])("masks %s consistently", (input, expected) => {
    expect(maskParticipantName(input)).toBe(expected);
  });

  it("constructs display data by whitelist", () => {
    const output = toDisplayRankingRow({
      sourceRecordId: "r-1",
      sourceIndex: 0,
      region: "东部赛区",
      event: "智能创作",
      group: "小学组",
      participantName: "林晓雨",
      score: "96.80",
      rank: 1,
      status: "valid",
    });

    expect(displayRankingRowSchema.parse(output)).toEqual({
      region: "东部赛区",
      event: "智能创作",
      group: "小学组",
      participantName: "林*雨",
      score: "96.80",
      rank: 1,
    });
    expect(output).not.toHaveProperty("sourceRecordId");
  });
});

describe("freshness", () => {
  const now = new Date("2026-07-19T06:00:00.000Z");

  it("uses the confirmed 2 and 5 minute thresholds", () => {
    expect(getFreshness(null, now)).toBe("empty");
    expect(getFreshness("2026-07-19T05:59:00.000Z", now)).toBe("fresh");
    expect(getFreshness("2026-07-19T05:57:59.000Z", now)).toBe("stale");
    expect(getFreshness("2026-07-19T05:55:00.000Z", now)).toBe("critical");
  });
});
