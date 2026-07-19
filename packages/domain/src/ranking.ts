import type { IssueCode } from "./errors.js";
import type { SourceRecord } from "./record.js";

export interface RankingRow {
  sourceRecordId: string;
  sourceIndex: number;
  region: string;
  event: string;
  group: string;
  participantName: string;
  score: string;
  rank: number;
  status: "valid";
}

export interface RankingIssue {
  sourceRecordId: string;
  sourceIndex: number;
  region: string;
  event: string;
  group: string;
  participantName: string;
  scoreRaw: string;
  code: IssueCode;
}

export interface RankingResult {
  rows: RankingRow[];
  issues: RankingIssue[];
  partitionCount: number;
  inputCount: number;
}

export type RankedSourceRecord = SourceRecord & { normalizedScore: string };
