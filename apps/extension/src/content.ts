import { isPageProbeResponse, pageChannel, type ProbeReport } from "./messages.js";

function injectBridge(): void {
  if (document.documentElement.dataset.xinxisuyangProbeInjected === "true") return;
  document.documentElement.dataset.xinxisuyangProbeInjected = "true";
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("page-bridge.js");
  script.async = false;
  script.addEventListener("load", () => script.remove());
  (document.head ?? document.documentElement).append(script);
}

async function runProbe(): Promise<ProbeReport> {
  injectBridge();
  const nonce = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", receive);
      reject(new Error("PROBE_PAGE_TIMEOUT"));
    }, 15_000);
    const receive = (event: MessageEvent<unknown>) => {
      if (event.source !== window || event.origin !== location.origin) return;
      if (!isPageProbeResponse(event.data, nonce)) return;
      window.clearTimeout(timeout);
      window.removeEventListener("message", receive);
      resolve(event.data.payload);
    };
    window.addEventListener("message", receive);
    window.postMessage({ channel: pageChannel, type: "PROBE_REQUEST", nonce }, location.origin);
  });
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (typeof message !== "object" || message === null || (message as { type?: string }).type !== "RUN_PROBE") {
    return false;
  }
  void runProbe()
    .then(async (payload) => {
      const result: unknown = await chrome.runtime.sendMessage({ type: "PROBE_METADATA", payload });
      sendResponse(result);
    })
    .catch((error: unknown) => {
      sendResponse({ ok: false, code: error instanceof Error ? error.message : "PROBE_PAGE_FAILED" });
    });
  return true;
});

injectBridge();
