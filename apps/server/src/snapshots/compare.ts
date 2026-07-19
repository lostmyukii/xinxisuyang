import type { CurrentSnapshot } from "@xinxisuyang/storage";

interface ComparableEntry {
  sourceRecordId: string;
  sourceIndex: number;
  region: string;
  event: string;
  group: string;
  participantName: string;
  score: string;
  rank: number | null;
  status: "valid" | "issue";
  issueCode: string | null;
}

function entries(snapshot: CurrentSnapshot): Map<string, ComparableEntry> {
  const values = new Map<string, ComparableEntry>();
  const all: ComparableEntry[] = [
    ...snapshot.rows.map((row): ComparableEntry => ({
      sourceRecordId: row.sourceRecordId,
      sourceIndex: row.sourceIndex,
      region: row.region,
      event: row.event,
      group: row.group,
      participantName: row.participantName,
      score: row.score,
      rank: row.rank,
      status: "valid",
      issueCode: null,
    })),
    ...snapshot.issues.map((issue): ComparableEntry => ({
      sourceRecordId: issue.sourceRecordId,
      sourceIndex: issue.sourceIndex,
      region: issue.region,
      event: issue.event,
      group: issue.group,
      participantName: issue.participantName,
      score: issue.scoreRaw,
      rank: null,
      status: "issue",
      issueCode: issue.code,
    })),
  ].sort((left, right) => left.sourceIndex - right.sourceIndex);
  const occurrences = new Map<string, number>();
  for (const entry of all) {
    if (!entry.sourceRecordId.startsWith("manual-")) {
      values.set(`id:${entry.sourceRecordId}`, entry);
      continue;
    }
    const base = ["manual", entry.region, entry.event, entry.group, entry.participantName].join("\u001f");
    const occurrence = (occurrences.get(base) ?? 0) + 1;
    occurrences.set(base, occurrence);
    values.set(`${base}\u001f${occurrence}`, entry);
  }
  return values;
}

function equivalent(left: ComparableEntry, right: ComparableEntry): boolean {
  return left.region === right.region &&
    left.event === right.event &&
    left.group === right.group &&
    left.participantName === right.participantName &&
    left.score === right.score &&
    left.rank === right.rank &&
    left.status === right.status &&
    left.issueCode === right.issueCode;
}

export function compareSnapshots(base: CurrentSnapshot, target: CurrentSnapshot) {
  const before = entries(base);
  const after = entries(target);
  const keys = Array.from(new Set([...before.keys(), ...after.keys()])).sort();
  const changes = keys.flatMap((key) => {
    const previous = before.get(key) ?? null;
    const next = after.get(key) ?? null;
    if (previous !== null && next !== null && equivalent(previous, next)) return [];
    return [{
      type: previous === null ? "added" as const : next === null ? "removed" as const : "changed" as const,
      sourceRecordId: next?.sourceRecordId ?? previous?.sourceRecordId ?? "",
      participantName: next?.participantName ?? previous?.participantName ?? "",
      before: previous,
      after: next,
    }];
  });
  const added = changes.filter((change) => change.type === "added").length;
  const removed = changes.filter((change) => change.type === "removed").length;
  const changed = changes.filter((change) => change.type === "changed").length;
  return {
    base: base.summary,
    target: target.summary,
    summary: {
      added,
      removed,
      changed,
      unchanged: keys.length - changes.length,
      totalChanges: changes.length,
    },
    changes: changes.slice(0, 200),
    truncated: changes.length > 200,
  };
}
