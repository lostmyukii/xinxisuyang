import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type {
  EventRule,
  RankingIssue,
  RankingResult,
  RankingRow,
  SnapshotSource,
  SnapshotSummary,
  SourceRecord,
} from "@xinxisuyang/domain";
import { eventRuleSchema, snapshotSummarySchema } from "@xinxisuyang/domain";
import { ColumnCipher } from "./crypto/columns.js";
import { snapshotContentHash } from "./hash.js";
import { runMigrations } from "./migrations.js";

interface RepositoryOptions {
  path: string;
  encryptionKey: Uint8Array;
}

interface PublishInput {
  records: readonly SourceRecord[];
  result: RankingResult;
  source: SnapshotSource;
  now?: Date;
  beforeCommit?: () => void;
}

export interface PublishResult {
  snapshot: SnapshotSummary;
  created: boolean;
}

export interface CurrentSnapshot {
  summary: SnapshotSummary;
  rows: RankingRow[];
  issues: RankingIssue[];
}

interface SnapshotRow {
  id: string;
  created_at: string;
  source: string;
  content_hash: string;
  record_count: number;
  valid_count: number;
  issue_count: number;
}

function summaryFromRow(row: SnapshotRow): SnapshotSummary {
  return snapshotSummarySchema.parse({
    id: row.id,
    createdAt: row.created_at,
    source: row.source,
    contentHash: row.content_hash,
    recordCount: row.record_count,
    validCount: row.valid_count,
    issueCount: row.issue_count,
  });
}

export class CompetitionRepository {
  readonly #database: DatabaseSync;
  readonly #cipher: ColumnCipher;

  constructor(options: RepositoryOptions) {
    if (options.path !== ":memory:") mkdirSync(dirname(options.path), { recursive: true });
    this.#database = new DatabaseSync(options.path);
    this.#cipher = new ColumnCipher(options.encryptionKey);
    runMigrations(this.#database);
  }

  close(): void {
    this.#database.close();
  }

  replaceEventRules(rules: readonly EventRule[], now = new Date()): EventRule[] {
    const parsed = rules.map((rule) => eventRuleSchema.parse(rule));
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      this.#database.exec("DELETE FROM event_rules");
      const insert = this.#database.prepare(
        "INSERT INTO event_rules(event, min_score, max_score, enabled, updated_at) VALUES (?, ?, ?, ?, ?)",
      );
      for (const rule of parsed) {
        insert.run(rule.event, rule.minScore, rule.maxScore, rule.enabled ? 1 : 0, now.toISOString());
      }
      this.#database.exec("COMMIT");
      return parsed;
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  listEventRules(): EventRule[] {
    const rows = this.#database
      .prepare("SELECT event, min_score, max_score, enabled FROM event_rules ORDER BY event")
      .all() as Array<{ event: string; min_score: string; max_score: string; enabled: number }>;
    return rows.map((row) =>
      eventRuleSchema.parse({
        event: row.event,
        minScore: row.min_score,
        maxScore: row.max_score,
        enabled: row.enabled === 1,
      }),
    );
  }

  publish(input: PublishInput): PublishResult {
    const contentHash = snapshotContentHash(input.records, input.result);
    const current = this.#findCurrentSummary();
    if (current?.contentHash === contentHash) return { snapshot: current, created: false };

    const now = input.now ?? new Date();
    const snapshot: SnapshotSummary = {
      id: randomUUID(),
      createdAt: now.toISOString(),
      source: input.source,
      contentHash,
      recordCount: input.records.length,
      validCount: input.result.rows.length,
      issueCount: input.result.issues.length,
    };

    this.#database.exec("BEGIN IMMEDIATE");
    try {
      this.#database
        .prepare(
          `INSERT INTO snapshots(
            id, created_at, source, content_hash, record_count, valid_count, issue_count, is_current
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
        )
        .run(
          snapshot.id,
          snapshot.createdAt,
          snapshot.source,
          snapshot.contentHash,
          snapshot.recordCount,
          snapshot.validCount,
          snapshot.issueCount,
        );

      const insertRecord = this.#database.prepare(
        `INSERT INTO source_records(
          snapshot_id, source_record_id, source_index, region, event, group_name,
          participant_name, score_raw, phone_encrypted, id_number_encrypted, source_fields_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const record of input.records) {
        insertRecord.run(
          snapshot.id,
          record.sourceRecordId,
          record.sourceIndex,
          record.region,
          record.event,
          record.group,
          record.participantName,
          record.scoreRaw,
          this.#cipher.encrypt(record.phone),
          this.#cipher.encrypt(record.idNumber),
          JSON.stringify(record.sourceFields),
        );
      }

      const insertRow = this.#database.prepare(
        `INSERT INTO ranking_rows(
          snapshot_id, source_record_id, source_index, region, event, group_name,
          participant_name, score, rank
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const row of input.result.rows) {
        insertRow.run(
          snapshot.id,
          row.sourceRecordId,
          row.sourceIndex,
          row.region,
          row.event,
          row.group,
          row.participantName,
          row.score,
          row.rank,
        );
      }

      const insertIssue = this.#database.prepare(
        `INSERT INTO ranking_issues(
          snapshot_id, source_record_id, source_index, region, event, group_name,
          participant_name, score_raw, code
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const issue of input.result.issues) {
        insertIssue.run(
          snapshot.id,
          issue.sourceRecordId,
          issue.sourceIndex,
          issue.region,
          issue.event,
          issue.group,
          issue.participantName,
          issue.scoreRaw,
          issue.code,
        );
      }

      input.beforeCommit?.();
      this.#database.prepare("UPDATE snapshots SET is_current = 0 WHERE is_current = 1").run();
      this.#database.prepare("UPDATE snapshots SET is_current = 1 WHERE id = ?").run(snapshot.id);
      this.#database
        .prepare(
          "INSERT INTO audit_events(id, created_at, action, snapshot_id, details_json) VALUES (?, ?, ?, ?, ?)",
        )
        .run(randomUUID(), now.toISOString(), "snapshot.published", snapshot.id, "{}");
      this.#database.exec("COMMIT");
      return { snapshot, created: true };
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  getCurrent(): CurrentSnapshot | null {
    const summary = this.#findCurrentSummary();
    if (summary === null) return null;

    const rows = this.#database
      .prepare(
        `SELECT source_record_id, source_index, region, event, group_name,
          participant_name, score, rank
        FROM ranking_rows WHERE snapshot_id = ?
        ORDER BY region, event, group_name, rank, source_index`,
      )
      .all(summary.id) as Array<{
        source_record_id: string;
        source_index: number;
        region: string;
        event: string;
        group_name: string;
        participant_name: string;
        score: string;
        rank: number;
      }>;

    const issues = this.#database
      .prepare(
        `SELECT source_record_id, source_index, region, event, group_name,
          participant_name, score_raw, code
        FROM ranking_issues WHERE snapshot_id = ? ORDER BY source_index`,
      )
      .all(summary.id) as Array<{
        source_record_id: string;
        source_index: number;
        region: string;
        event: string;
        group_name: string;
        participant_name: string;
        score_raw: string;
        code: RankingIssue["code"];
      }>;

    return {
      summary,
      rows: rows.map((row) => ({
        sourceRecordId: row.source_record_id,
        sourceIndex: row.source_index,
        region: row.region,
        event: row.event,
        group: row.group_name,
        participantName: row.participant_name,
        score: row.score,
        rank: row.rank,
        status: "valid",
      })),
      issues: issues.map((issue) => ({
        sourceRecordId: issue.source_record_id,
        sourceIndex: issue.source_index,
        region: issue.region,
        event: issue.event,
        group: issue.group_name,
        participantName: issue.participant_name,
        scoreRaw: issue.score_raw,
        code: issue.code,
      })),
    };
  }

  listSnapshots(): SnapshotSummary[] {
    const rows = this.#database
      .prepare(
        `SELECT id, created_at, source, content_hash, record_count, valid_count, issue_count
         FROM snapshots ORDER BY is_current DESC, created_at DESC`,
      )
      .all() as unknown as SnapshotRow[];
    return rows.map(summaryFromRow);
  }

  getCurrentSourceRecords(): SourceRecord[] {
    const summary = this.#findCurrentSummary();
    if (summary === null) return [];
    const rows = this.#database
      .prepare(
        `SELECT source_record_id, source_index, region, event, group_name,
          participant_name, score_raw, phone_encrypted, id_number_encrypted, source_fields_json
        FROM source_records WHERE snapshot_id = ? ORDER BY source_index`,
      )
      .all(summary.id) as Array<{
        source_record_id: string;
        source_index: number;
        region: string;
        event: string;
        group_name: string;
        participant_name: string;
        score_raw: string;
        phone_encrypted: string | null;
        id_number_encrypted: string | null;
        source_fields_json: string;
      }>;
    return rows.map((row) => ({
      sourceRecordId: row.source_record_id,
      sourceIndex: row.source_index,
      region: row.region,
      event: row.event,
      group: row.group_name,
      participantName: row.participant_name,
      scoreRaw: row.score_raw,
      phone: this.#cipher.decrypt(row.phone_encrypted),
      idNumber: this.#cipher.decrypt(row.id_number_encrypted),
      sourceFields: JSON.parse(row.source_fields_json) as Record<string, unknown>,
    }));
  }

  recordAudit(action: string, snapshotId: string | null, details: Record<string, unknown>): void {
    this.#database
      .prepare(
        "INSERT INTO audit_events(id, created_at, action, snapshot_id, details_json) VALUES (?, ?, ?, ?, ?)",
      )
      .run(randomUUID(), new Date().toISOString(), action, snapshotId, JSON.stringify(details));
  }

  restoreSnapshot(snapshotId: string): CurrentSnapshot {
    const exists = this.#database.prepare("SELECT 1 AS found FROM snapshots WHERE id = ?").get(snapshotId);
    if (exists === undefined) throw new Error("SNAPSHOT_NOT_FOUND");
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      this.#database.prepare("UPDATE snapshots SET is_current = 0 WHERE is_current = 1").run();
      this.#database.prepare("UPDATE snapshots SET is_current = 1 WHERE id = ?").run(snapshotId);
      this.#database
        .prepare(
          "INSERT INTO audit_events(id, created_at, action, snapshot_id, details_json) VALUES (?, ?, ?, ?, ?)",
        )
        .run(randomUUID(), new Date().toISOString(), "snapshot.restored", snapshotId, "{}");
      this.#database.exec("COMMIT");
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
    const current = this.getCurrent();
    if (current === null) throw new Error("SNAPSHOT_RESTORE_FAILED");
    return current;
  }

  #findCurrentSummary(): SnapshotSummary | null {
    const row = this.#database
      .prepare(
        `SELECT id, created_at, source, content_hash, record_count, valid_count, issue_count
         FROM snapshots WHERE is_current = 1 LIMIT 1`,
      )
      .get() as SnapshotRow | undefined;
    return row === undefined ? null : summaryFromRow(row);
  }
}
