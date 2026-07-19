function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function round(value) {
  return Number(value.toFixed(2));
}

export function summarizeSampling(samples, durationMinutes, intervalSeconds) {
  const gaps = samples.slice(1).map(
    (sample, index) => (Date.parse(sample.at) - Date.parse(samples[index].at)) / 1000,
  );
  const expectedSamples = durationMinutes * 60 / intervalSeconds;
  return {
    sampleCount: samples.length,
    expectedMinimumSamples: Math.max(1, Math.floor(expectedSamples * 0.95)),
    maxGapSeconds: round(gaps.length === 0 ? 0 : Math.max(...gaps)),
    maxAllowedGapSeconds: intervalSeconds * 2,
  };
}

export function summarizeMemory(samples, startedAt, durationMinutes, selectValue) {
  const warmupSeconds = Math.min(300, durationMinutes * 60 * 0.1);
  const stableSamples = samples.filter(
    (sample) => Date.parse(sample.at) >= Date.parse(startedAt) + warmupSeconds * 1000,
  );
  const selected = (stableSamples.length >= 2 ? stableSamples : samples)
    .map(selectValue)
    .filter(Number.isFinite);
  if (selected.length < 2) throw new Error("MEMORY_SAMPLE_COUNT_INSUFFICIENT");

  const windowSize = Math.max(1, Math.min(10, Math.floor(selected.length / 4)));
  const baselineMb = median(selected.slice(0, windowSize));
  const finalMb = median(selected.slice(-windowSize));
  const rollingMedians = Array.from(
    { length: selected.length - windowSize + 1 },
    (_, index) => median(selected.slice(index, index + windowSize)),
  );
  const peakWindowMb = Math.max(...rollingMedians);
  const allValues = samples.map(selectValue).filter(Number.isFinite);
  return {
    warmupSeconds: round(warmupSeconds),
    windowSize,
    baselineMb: round(baselineMb),
    finalMb: round(finalMb),
    sustainedGrowthMb: round(Math.max(0, finalMb - baselineMb)),
    peakWindowGrowthMb: round(Math.max(0, peakWindowMb - baselineMb)),
    fullRangeMb: round(Math.max(...allValues) - Math.min(...allValues)),
    fullMinimumMb: round(Math.min(...allValues)),
    fullMaximumMb: round(Math.max(...allValues)),
  };
}
