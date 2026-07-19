import type { ProbeReport } from "./messages.js";

async function reportProbe(payload: ProbeReport): Promise<{ ok: boolean; code?: string }> {
  const settings = await chrome.storage.local.get("pairingToken");
  const pairingToken = typeof settings.pairingToken === "string" ? settings.pairingToken : undefined;
  if (pairingToken === undefined || pairingToken.length === 0) {
    return { ok: false, code: "PAIRING_TOKEN_REQUIRED" };
  }
  try {
    const response = await fetch("http://127.0.0.1:4318/api/probe/report", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-competition-token": pairingToken,
      },
      body: JSON.stringify(payload),
    });
    const result = response.ok
      ? { ok: true }
      : { ok: false, code: response.status === 401 ? "PAIRING_TOKEN_INVALID" : "LOCAL_SERVICE_REJECTED" };
    await chrome.storage.session.set({ latestProbe: { ...result, observedAt: payload.observedAt } });
    return result;
  } catch {
    const result = { ok: false, code: "LOCAL_SERVICE_UNAVAILABLE" };
    await chrome.storage.session.set({ latestProbe: { ...result, observedAt: payload.observedAt } });
    return result;
  }
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (typeof message !== "object" || message === null) return false;
  const candidate = message as { type?: string; payload?: ProbeReport };
  if (candidate.type === "PROBE_METADATA" && candidate.payload !== undefined) {
    void reportProbe(candidate.payload).then(sendResponse);
    return true;
  }
  if (candidate.type === "GET_PROBE_STATUS") {
    void chrome.storage.session.get("latestProbe").then((value) => sendResponse(value.latestProbe ?? null));
    return true;
  }
  return false;
});
