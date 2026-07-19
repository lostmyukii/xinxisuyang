import { createHash } from "node:crypto";
import type { EventRule, RankingResult, SourceRecord } from "@xinxisuyang/domain";

export function snapshotContentHash(
  records: readonly SourceRecord[],
  result: RankingResult,
  rules: readonly EventRule[],
  fieldVersion: string,
): string {
  const normalized = records
    .map((record) => ({
      ...record,
      sourceFields: Object.fromEntries(Object.entries(record.sourceFields).sort(([a], [b]) => a.localeCompare(b))),
    }))
    .sort((left, right) => left.sourceRecordId.localeCompare(right.sourceRecordId));

  const normalizedRules = [...rules]
    .map((rule) => ({ ...rule, event: rule.event.trim() }))
    .sort((left, right) => left.event.localeCompare(right.event, "zh-CN"));

  return createHash("sha256")
    .update(JSON.stringify({ fieldVersion, rules: normalizedRules, records: normalized, rows: result.rows, issues: result.issues }))
    .digest("hex");
}
