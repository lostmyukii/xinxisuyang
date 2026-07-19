export type Freshness = "fresh" | "stale" | "critical" | "empty";

export interface SnapshotSummary {
  id: string;
  createdAt: string;
  source: "automatic" | "immediate" | "manual";
  contentHash: string;
  recordCount: number;
  validCount: number;
  issueCount: number;
}

export interface StatusResponse {
  state: string;
  lastErrorCode: string | null;
  lastSuccessAt: string | null;
  snapshot: SnapshotSummary | null;
  freshness: Freshness;
  counts: { records: number; valid: number; issues: number };
  collectionMode: "manual-only" | "automatic";
  collectionMessage: string;
}

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
  code: string;
  message: string;
}

export interface EventRule {
  event: string;
  minScore: string;
  maxScore: string;
  enabled: boolean;
}
