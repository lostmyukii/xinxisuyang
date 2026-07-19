import { describe, expect, it } from "vitest";
import { isPageProbeResponse, pageChannel } from "../src/messages.js";

describe("page bridge message validation", () => {
  const payload = {
    documentPathHash: "a".repeat(64),
    observedAt: "2026-07-19T06:00:00.000Z",
    structure: {
      canvasCount: 1,
      iframeCount: 0,
      tableCount: 0,
      editableCount: 0,
      hasWorkbookGlobal: true,
    },
    extraction: {
      status: "STRUCTURE_ONLY" as const,
      fieldCount: null,
      recordCount: null,
      fieldNamesHash: null,
      recordIdsHash: null,
      contentHash: null,
    },
  };

  it("accepts only the current nonce and channel", () => {
    expect(
      isPageProbeResponse(
        { channel: pageChannel, type: "PROBE_RESPONSE", nonce: "expected", payload },
        "expected",
      ),
    ).toBe(true);
    expect(
      isPageProbeResponse(
        { channel: pageChannel, type: "PROBE_RESPONSE", nonce: "attacker", payload },
        "expected",
      ),
    ).toBe(false);
    expect(isPageProbeResponse({ ...payload, phone: "must-not-pass" }, "expected")).toBe(false);
  });
});
