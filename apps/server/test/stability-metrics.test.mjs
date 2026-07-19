import { describe, expect, it } from "vitest";
import { summarizeMemory, summarizeSampling } from "../../../scripts/stability-metrics.mjs";

function samples(values, minuteOffsets) {
  const startedAt = Date.parse("2026-07-19T00:00:00.000Z");
  return values.map((rssMb, index) => ({
    at: new Date(startedAt + minuteOffsets[index] * 60_000).toISOString(),
    rssMb,
  }));
}

describe("stability metrics", () => {
  it("rejects sleep-sized sample gaps and insufficient coverage", () => {
    const result = summarizeSampling(
      samples([100, 101, 102], [0, 0.5, 17.5]),
      20,
      30,
    );
    expect(result).toEqual({
      sampleCount: 3,
      expectedMinimumSamples: 38,
      maxGapSeconds: 1020,
      maxAllowedGapSeconds: 60,
    });
  });

  it("does not classify a Chrome startup peak followed by a stable decline as growth", () => {
    const input = samples(
      [870, 600, 410, 400, 390, 380, 370, 360, 350, 340, 330, 320, 310, 300, 290, 280],
      [0, 1, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
    );
    const result = summarizeMemory(input, "2026-07-19T00:00:00.000Z", 240, (sample) => sample.rssMb);
    expect(result.sustainedGrowthMb).toBe(0);
    expect(result.peakWindowGrowthMb).toBe(0);
    expect(result.fullRangeMb).toBe(590);
  });

  it("detects sustained memory growth after warmup", () => {
    const input = samples(
      [900, 700, 300, 310, 320, 400, 500, 600, 700, 750],
      [0, 1, 6, 7, 8, 9, 10, 11, 12, 13],
    );
    const result = summarizeMemory(input, "2026-07-19T00:00:00.000Z", 240, (sample) => sample.rssMb);
    expect(result.sustainedGrowthMb).toBeGreaterThan(384);
    expect(result.peakWindowGrowthMb).toBeGreaterThan(384);
  });
});
