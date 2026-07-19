import type { Decimal } from "decimal.js";
import type {
  EventRule,
  RankingIssue,
  RankingResult,
  RankingRow,
  SourceRecord,
} from "@xinxisuyang/domain";
import { isRecordIdentityComplete, partitionKey } from "./partition.js";
import { validateScore } from "./validate-score.js";

interface ValidCandidate {
  record: SourceRecord;
  decimal: Decimal;
  normalizedScore: string;
}

function toIssue(record: SourceRecord, code: RankingIssue["code"]): RankingIssue {
  return {
    sourceRecordId: record.sourceRecordId,
    sourceIndex: record.sourceIndex,
    region: record.region,
    event: record.event,
    group: record.group,
    participantName: record.participantName,
    scoreRaw: record.scoreRaw,
    code,
  };
}

export function rankCompetition(records: readonly SourceRecord[], rules: readonly EventRule[]): RankingResult {
  const rulesByEvent = new Map(rules.map((rule) => [rule.event.trim(), rule]));
  const sourceIdCounts = new Map<string, number>();
  for (const record of records) {
    sourceIdCounts.set(record.sourceRecordId, (sourceIdCounts.get(record.sourceRecordId) ?? 0) + 1);
  }
  const partitions = new Map<string, ValidCandidate[]>();
  const issues: RankingIssue[] = [];

  for (const record of records) {
    if ((sourceIdCounts.get(record.sourceRecordId) ?? 0) > 1) {
      issues.push(toIssue(record, "DUPLICATE_SOURCE_ID"));
      continue;
    }
    if (!isRecordIdentityComplete(record)) {
      issues.push(toIssue(record, "RECORD_INCOMPLETE"));
      continue;
    }

    const rule = rulesByEvent.get(record.event.trim());
    const validation = validateScore(record.scoreRaw, rule);
    if (!validation.ok) {
      issues.push(toIssue(record, validation.code));
      continue;
    }

    const key = partitionKey(record);
    const values = partitions.get(key) ?? [];
    values.push({
      record,
      decimal: validation.decimal,
      normalizedScore: validation.normalized,
    });
    partitions.set(key, values);
  }

  const rows: RankingRow[] = [];
  for (const candidates of partitions.values()) {
    candidates.sort((left, right) => {
      const scoreOrder = right.decimal.comparedTo(left.decimal);
      if (scoreOrder !== 0) return scoreOrder;
      const sourceOrder = left.record.sourceIndex - right.record.sourceIndex;
      if (sourceOrder !== 0) return sourceOrder;
      return left.record.sourceRecordId.localeCompare(right.record.sourceRecordId, "zh-CN");
    });

    let currentRank = 0;
    let previousScore: Decimal | undefined;
    candidates.forEach((candidate, index) => {
      if (previousScore === undefined || !candidate.decimal.equals(previousScore)) {
        currentRank = index + 1;
        previousScore = candidate.decimal;
      }

      rows.push({
        sourceRecordId: candidate.record.sourceRecordId,
        sourceIndex: candidate.record.sourceIndex,
        region: candidate.record.region.trim(),
        event: candidate.record.event.trim(),
        group: candidate.record.group.trim(),
        participantName: candidate.record.participantName.trim(),
        score: candidate.normalizedScore,
        rank: currentRank,
        status: "valid",
      });
    });
  }

  issues.sort((left, right) => left.sourceIndex - right.sourceIndex);
  return { rows, issues, partitionCount: partitions.size, inputCount: records.length };
}
