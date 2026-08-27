import { authHeaders, frontendConfig } from "../../config";
import { MasterDataApiError, type ApiErrorPayload } from "./master-data-types";

export async function request<T>(path: string, options: RequestInit = {}) {
  const response = await fetch(frontendConfig.apiBaseUrl + path, {
    ...options,
    headers: {
      ...authHeaders(),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new MasterDataApiError(
      typeof payload === "object" && payload !== null ? (payload as ApiErrorPayload) : {},
      "Không thể cập nhật dữ liệu danh mục.",
    );
  }
  return payload as T;
}
