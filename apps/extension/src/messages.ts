export const pageChannel = "XINXISUYANG_KDOCS_PROBE_V1";
export const targetDocumentId = "v130lGtJ";

export interface ProbeReport {
  documentPathHash: string;
  observedAt: string;
  structure: {
    canvasCount: number;
    iframeCount: number;
    tableCount: number;
    editableCount: number;
    hasWorkbookGlobal: boolean;
  };
  extraction: {
    status: "STRUCTURE_ONLY" | "COMPLETE_RECORDS";
    fieldCount: number | null;
    recordCount: number | null;
    fieldNamesHash: string | null;
    recordIdsHash: string | null;
    contentHash: string | null;
  };
}

export interface PageProbeResponse {
  channel: typeof pageChannel;
  type: "PROBE_RESPONSE";
  nonce: string;
  payload: ProbeReport;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && keys.every((key) => expected.includes(key));
}

function boundedInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 1_000_000;
}

function nullableHash(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && /^[a-f0-9]{64}$/u.test(value));
}

function nullableCount(value: unknown): value is number | null {
  return value === null || boundedInteger(value);
}

export function isTargetKdocsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.hostname === "www.kdocs.cn" || url.hostname === "kdocs.cn") &&
      `${url.pathname}${url.search}${url.hash}`.includes(targetDocumentId);
  } catch {
    return false;
  }
}

export function parseProbeReport(value: unknown): ProbeReport | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ["documentPathHash", "observedAt", "structure", "extraction"])) return null;
  if (typeof value.documentPathHash !== "string" || !/^[a-f0-9]{64}$/u.test(value.documentPathHash)) return null;
  if (typeof value.observedAt !== "string" || value.observedAt.length > 40 || !Number.isFinite(Date.parse(value.observedAt))) return null;
  if (!isRecord(value.structure) || !hasOnlyKeys(value.structure, ["canvasCount", "iframeCount", "tableCount", "editableCount", "hasWorkbookGlobal"])) return null;
  if (!boundedInteger(value.structure.canvasCount) || !boundedInteger(value.structure.iframeCount) ||
      !boundedInteger(value.structure.tableCount) || !boundedInteger(value.structure.editableCount) ||
      typeof value.structure.hasWorkbookGlobal !== "boolean") return null;
  if (!isRecord(value.extraction) || !hasOnlyKeys(value.extraction, ["status", "fieldCount", "recordCount", "fieldNamesHash", "recordIdsHash", "contentHash"])) return null;
  if (value.extraction.status !== "STRUCTURE_ONLY" && value.extraction.status !== "COMPLETE_RECORDS") return null;
  if (!nullableCount(value.extraction.fieldCount) || !nullableCount(value.extraction.recordCount) ||
      !nullableHash(value.extraction.fieldNamesHash) || !nullableHash(value.extraction.recordIdsHash) ||
      !nullableHash(value.extraction.contentHash)) return null;
  if (value.extraction.status === "STRUCTURE_ONLY" && [
    value.extraction.fieldCount,
    value.extraction.recordCount,
    value.extraction.fieldNamesHash,
    value.extraction.recordIdsHash,
    value.extraction.contentHash,
  ].some((item) => item !== null)) return null;
  if (value.extraction.status === "COMPLETE_RECORDS" && [
    value.extraction.fieldCount,
    value.extraction.recordCount,
    value.extraction.fieldNamesHash,
    value.extraction.recordIdsHash,
    value.extraction.contentHash,
  ].some((item) => item === null)) return null;

  return {
    documentPathHash: value.documentPathHash,
    observedAt: value.observedAt,
    structure: {
      canvasCount: value.structure.canvasCount,
      iframeCount: value.structure.iframeCount,
      tableCount: value.structure.tableCount,
      editableCount: value.structure.editableCount,
      hasWorkbookGlobal: value.structure.hasWorkbookGlobal,
    },
    extraction: {
      status: value.extraction.status,
      fieldCount: value.extraction.fieldCount,
      recordCount: value.extraction.recordCount,
      fieldNamesHash: value.extraction.fieldNamesHash,
      recordIdsHash: value.extraction.recordIdsHash,
      contentHash: value.extraction.contentHash,
    },
  };
}

export function parsePageProbeResponse(value: unknown, nonce: string): PageProbeResponse | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ["channel", "type", "nonce", "payload"])) return null;
  if (value.channel !== pageChannel || value.type !== "PROBE_RESPONSE" || value.nonce !== nonce) return null;
  const payload = parseProbeReport(value.payload);
  return payload === null ? null : { channel: pageChannel, type: "PROBE_RESPONSE", nonce, payload };
}

export function isPageProbeResponse(value: unknown, nonce: string): value is PageProbeResponse {
  return parsePageProbeResponse(value, nonce) !== null;
}
