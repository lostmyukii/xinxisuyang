const tokenInput = document.querySelector<HTMLInputElement>("#pairing-token");
const saveButton = document.querySelector<HTMLButtonElement>("#save-token");
const runButton = document.querySelector<HTMLButtonElement>("#run-probe");
const status = document.querySelector<HTMLParagraphElement>("#status");

const errorMessages: Readonly<Record<string, string>> = {
  TARGET_DOCUMENT_REQUIRED: "请先打开指定的金山成绩表格，再执行检查",
  TARGET_TAB_NOT_FOUND: "没有找到当前标签页，请重新打开目标表格",
  PROBE_PAGE_TIMEOUT: "目标页面未响应，请刷新金山文档后重试",
  PAIRING_TOKEN_REQUIRED: "请先保存本次启动终端显示的配对码",
  PAIRING_TOKEN_INVALID: "配对码已失效，请复制本次启动的新配对码",
  LOCAL_SERVICE_UNAVAILABLE: "无法连接本机服务，请确认赛事指挥台仍在运行",
  LOCAL_SERVICE_REJECTED: "本机服务拒绝了探针结果，请检查服务日志",
  PROBE_PAYLOAD_INVALID: "页面结构结果未通过安全校验",
};

function errorMessage(code: string | undefined): string {
  return code === undefined ? "结构检查未完成，请刷新目标页面后重试" : errorMessages[code] ?? "结构检查未完成，请检查目标页面与本机服务";
}

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
      status.textContent = probeResult.ok === true ? "结构探针已送达本机服务" : errorMessage(probeResult.code);
    })
    .catch((error: unknown) => {
      status.textContent = errorMessage(error instanceof Error ? error.message : undefined);
    })
    .finally(() => {
      runButton.disabled = false;
    });
});
