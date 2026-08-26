import { authHeaders, frontendConfig } from "../config";

export class ApiRequestError extends Error {
  status: number;
  payload: unknown;

  constructor(status: number, payload: unknown) {
    const message =
      typeof payload === "object" && payload !== null && "message" in payload && typeof payload.message === "string"
        ? payload.message
        : `API trả lỗi HTTP ${status}.`;
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.payload = payload;
  }
}

export async function apiRequest<T>(path: string, options: RequestInit = {}) {
  const response = await fetch(path.startsWith("http") ? path : `${frontendConfig.apiBaseUrl}${path}`, {
    ...options,
    headers: {
      ...authHeaders(),
      ...(options.body && !(options.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new ApiRequestError(response.status, payload);
  return payload as T;
}

export async function apiBlob(path: string, options: RequestInit = {}) {
  const response = await fetch(path.startsWith("http") ? path : `${frontendConfig.apiBaseUrl}${path}`, {
    ...options,
    headers: { ...authHeaders(), ...options.headers },
  });
  if (!response.ok) throw new ApiRequestError(response.status, await response.json().catch(() => null));
  return response.blob();
}

export async function apiText(path: string, options: RequestInit = {}) {
  const response = await fetch(path.startsWith("http") ? path : `${frontendConfig.apiBaseUrl}${path}`, {
    ...options,
    headers: { ...authHeaders(), ...options.headers },
  });
  const payload = await response.text();
  if (!response.ok) throw new ApiRequestError(response.status, payload);
  return payload;
}
