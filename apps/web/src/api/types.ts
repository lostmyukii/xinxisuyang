export type Freshness = "fresh" | "stale" | "critical" | "empty";

export interface SnapshotSummary {
  id: string;
  createdAt: string;
  source: "automatic" | "immediate" | "manual";
  fieldVersion: string;
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
  freshnessSettings: FreshnessSettings;
  counts: { records: number; valid: number; issues: number };
  collectionMode: "manual-only" | "automatic";
  collectionMessage: string;
}

export interface FreshnessSettings {
  staleAfterSeconds: number;
  criticalAfterSeconds: number;
}

export interface SyncRun {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  source: "automatic" | "immediate" | "manual";
  state: "running" | "succeeded" | "failed";
  recordCount: number | null;
  errorCode: string | null;
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
