export const pageChannel = "XINXISUYANG_KDOCS_PROBE_V1";

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

export function isPageProbeResponse(value: unknown, nonce: string): value is PageProbeResponse {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<PageProbeResponse>;
  return (
    candidate.channel === pageChannel &&
    candidate.type === "PROBE_RESPONSE" &&
    candidate.nonce === nonce &&
    typeof candidate.payload?.documentPathHash === "string" &&
    candidate.payload.documentPathHash.length === 64 &&
    (candidate.payload.extraction?.status === "STRUCTURE_ONLY" ||
      candidate.payload.extraction?.status === "COMPLETE_RECORDS")
  );
}
