const configuredApiBase: unknown = import.meta.env.VITE_API_BASE;
const apiBase = typeof configuredApiBase === "string" ? configuredApiBase : "http://127.0.0.1:4318";

export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}

const errorMessages: Readonly<Record<string, string>> = {
  INPUT_SCHEMA_INVALID: "输入内容不符合要求，请检查必填字段和数值范围。",
  IMPORT_PREVIEW_REQUIRED: "请先生成导入预览，再发布当前候选数据。",
  IMPORT_CANDIDATE_CHANGED: "候选数据已变化，请重新生成预览后再发布。",
  IMPORT_MAPPING_FIELD_MISSING: "源表字段已变化，请重新确认字段映射。",
  IMPORT_DUPLICATE_HEADERS: "源表包含重复列名，请先修正列名。",
  IMPORT_TOO_LARGE: "导入文件超过 10 MiB，请拆分或精简后重试。",
  IMPORT_TOO_MANY_WORKSHEETS: "XLSX 工作表数量超过 20 个，请精简后重试。",
  IMPORT_EMPTY: "没有读取到可导入的表格记录。",
  EVENT_RULE_DUPLICATE: "赛项名称不能重复，请合并或重命名重复赛项。",
  SNAPSHOT_NOT_FOUND: "目标快照不存在或已超过 30 天保留期。",
  SYNC_RUN_INTERRUPTED: "上次发布过程被意外中断，当前仍保留最近成功快照。",
  INTERNAL_ERROR: "本机服务处理失败，上一成功快照未受影响。",
  NETWORK_ERROR: "无法连接本机成绩服务，请确认服务仍在运行。",
};

export function describeError(error: unknown, fallback: string): string {
  const code = error instanceof ApiError
    ? error.code
    : error instanceof Error && /^[A-Z0-9_]+$/u.test(error.message)
      ? error.message
      : null;
  if (code !== null && errorMessages[code] !== undefined) return errorMessages[code];
  if (error instanceof TypeError) return errorMessages.NETWORK_ERROR ?? fallback;
  return fallback;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      ...(init?.body === undefined ? {} : { "content-type": "application/json" }),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: { code?: string } } | null;
    throw new ApiError(payload?.error?.code ?? `HTTP_${response.status}`, response.status);
  }
  return response.json() as Promise<T>;
}

export async function apiOrNull<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    return await api<T>(path, init);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export { apiBase };
