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
