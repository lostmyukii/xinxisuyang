import { createHash } from "node:crypto";
import type { FieldMapping, SourceRecord } from "@xinxisuyang/domain";
import { fieldMappingSchema, sourceRecordSchema } from "@xinxisuyang/domain";
import type { RawTable } from "./types.js";

export function validateMapping(headers: readonly string[], input: FieldMapping): FieldMapping {
  const mapping = fieldMappingSchema.parse(input);
  for (const header of Object.values(mapping)) {
    if (header !== undefined && !headers.includes(header)) {
      throw new Error("IMPORT_MAPPING_FIELD_MISSING");
    }
  }
  return mapping;
}

function valueAt(row: Record<string, string>, header: string | undefined): string | undefined {
  return header === undefined ? undefined : row[header]?.trim();
}

export function normalizeTable(table: RawTable, mappingInput: FieldMapping): SourceRecord[] {
  const mapping = validateMapping(table.headers, mappingInput);
  return table.rows.map((row, sourceIndex) => {
    const canonical = {
      region: valueAt(row, mapping.region) ?? "",
      event: valueAt(row, mapping.event) ?? "",
      group: valueAt(row, mapping.group) ?? "",
      participantName: valueAt(row, mapping.participantName) ?? "",
      scoreRaw: valueAt(row, mapping.scoreRaw) ?? "",
    };
    const mappedId = valueAt(row, mapping.sourceRecordId);
    const fallbackId = createHash("sha256")
      .update(JSON.stringify({ ...canonical, sourceIndex }))
      .digest("hex")
      .slice(0, 24);

    return sourceRecordSchema.parse({
      sourceRecordId: mappedId === undefined || mappedId.length === 0 ? `manual-${fallbackId}` : mappedId,
      sourceIndex,
      ...canonical,
      phone: valueAt(row, mapping.phone),
      idNumber: valueAt(row, mapping.idNumber),
      sourceFields: {},
    });
  });
}
