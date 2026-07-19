const tokenInput = document.querySelector<HTMLInputElement>("#pairing-token");
const saveButton = document.querySelector<HTMLButtonElement>("#save-token");
const runButton = document.querySelector<HTMLButtonElement>("#run-probe");
const status = document.querySelector<HTMLParagraphElement>("#status");

if (tokenInput === null || saveButton === null || runButton === null || status === null) {
  throw new Error("POPUP_DOM_INCOMPLETE");
}

const stored = await chrome.storage.local.get("pairingToken");
tokenInput.value = typeof stored.pairingToken === "string" ? stored.pairingToken : "";

saveButton.addEventListener("click", () => {
  void chrome.storage.local.set({ pairingToken: tokenInput.value.trim() }).then(() => {
    status.textContent = "配对码已保存在本机扩展中";
  });
});

runButton.addEventListener("click", () => {
  status.textContent = "正在只读检查页面结构…";
  runButton.disabled = true;
  void chrome.tabs
    .query({ active: true, currentWindow: true })
    .then(async (tabs) => {
      const tabId = tabs[0]?.id;
      if (tabId === undefined) throw new Error("TARGET_TAB_NOT_FOUND");
      const result: unknown = await chrome.tabs.sendMessage(tabId, { type: "RUN_PROBE" });
      const probeResult = typeof result === "object" && result !== null
        ? result as { ok?: boolean; code?: string }
        : {};
      status.textContent = probeResult.ok === true ? "结构探针已送达本机服务" : `检查未完成：${probeResult.code ?? "UNKNOWN"}`;
    })
    .catch((error: unknown) => {
      status.textContent = `检查未完成：${error instanceof Error ? error.message : "UNKNOWN"}`;
    })
    .finally(() => {
      runButton.disabled = false;
    });
});
