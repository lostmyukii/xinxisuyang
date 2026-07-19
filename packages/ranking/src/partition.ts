import type { SourceRecord } from "@xinxisuyang/domain";

const separator = "\u001f";

export function partitionKey(record: Pick<SourceRecord, "region" | "event" | "group">): string {
  return [record.region.trim(), record.event.trim(), record.group.trim()].join(separator);
}

export function isRecordIdentityComplete(record: SourceRecord): boolean {
  return [record.region, record.event, record.group, record.participantName].every(
    (value) => value.trim().length > 0,
  );
}
