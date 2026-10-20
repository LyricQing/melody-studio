import type { ApiErrorBody } from "@/lib/types";

export class ClientApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly hint?: string;

  constructor(status: number, code: string, message: string, hint?: string) {
    super(message);
    this.name = "ClientApiError";
    this.status = status;
    this.code = code;
    this.hint = hint;
  }
}

export async function requestJson<T>(
  input: string,
  init: RequestInit,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(input, { cache: "no-store", ...init });
  } catch {
    throw new ClientApiError(
      0,
      "NETWORK_ERROR",
      "网络连接失败，请检查网络后重试。",
    );
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text.trim()) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      throw new ClientApiError(
        502,
        "BAD_RESPONSE",
        "服务器返回了无法读取的响应。",
      );
    }
  }

  if (!response.ok) {
    const body = payload as Partial<ApiErrorBody> | null;
    const error = body?.error;
    throw new ClientApiError(
      response.status,
      error?.code || "REQUEST_FAILED",
      error?.message || "请求没有完成，请稍后重试。",
      error?.hint,
    );
  }

  return payload as T;
}

export function messageFromError(error: unknown): string {
  if (error instanceof ClientApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "发生了未知错误，请稍后重试。";
}

export function hintFromError(error: unknown): string | undefined {
  return error instanceof ClientApiError ? error.hint : undefined;
}