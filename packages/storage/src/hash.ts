import { createHash } from "node:crypto";
import type { RankingResult, SourceRecord } from "@xinxisuyang/domain";

export function snapshotContentHash(records: readonly SourceRecord[], result: RankingResult): string {
  const normalized = records
    .map((record) => ({
      ...record,
      sourceFields: Object.fromEntries(Object.entries(record.sourceFields).sort(([a], [b]) => a.localeCompare(b))),
    }))
    .sort((left, right) => left.sourceRecordId.localeCompare(right.sourceRecordId));

  return createHash("sha256")
    .update(JSON.stringify({ records: normalized, rows: result.rows, issues: result.issues }))
    .digest("hex");
}
