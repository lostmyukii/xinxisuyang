import { pageChannel, type ProbeReport } from "./messages.js";

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function createStructureReport(): Promise<ProbeReport> {
  const globalNames = Object.keys(globalThis);
  return {
    documentPathHash: await sha256(location.pathname),
    observedAt: new Date().toISOString(),
    structure: {
      canvasCount: document.querySelectorAll("canvas").length,
      iframeCount: document.querySelectorAll("iframe").length,
      tableCount: document.querySelectorAll("table").length,
      editableCount: document.querySelectorAll('[contenteditable="true"], input, textarea').length,
      hasWorkbookGlobal: globalNames.some((name) => /sheet|workbook|spread|excel|kso|wps/iu.test(name)),
    },
    extraction: {
      status: "STRUCTURE_ONLY",
      fieldCount: null,
      recordCount: null,
      fieldNamesHash: null,
      recordIdsHash: null,
      contentHash: null,
    },
  };
}

window.addEventListener("message", (event: MessageEvent<unknown>) => {
  if (event.source !== window || event.origin !== location.origin) return;
  if (typeof event.data !== "object" || event.data === null) return;
  const request = event.data as { channel?: string; type?: string; nonce?: string };
  if (request.channel !== pageChannel || request.type !== "PROBE_REQUEST" || request.nonce === undefined) return;

  void createStructureReport().then((payload) => {
    window.postMessage(
      { channel: pageChannel, type: "PROBE_RESPONSE", nonce: request.nonce, payload },
      location.origin,
    );
  });
});
