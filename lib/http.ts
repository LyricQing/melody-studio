import { AppError, toApiError } from "@/lib/errors";

export const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, x-rh-key, authorization",
  "access-control-max-age": "86400",
  "cache-control": "no-store",
};

export function jsonResponse(
  data: unknown,
  options: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return new Response(JSON.stringify(data), {
    status: options.status ?? 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...CORS_HEADERS,
      ...options.headers,
    },
  });
}

export function preflightResponse(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export function errorResponse(error: unknown): Response {
  const { status, body } = toApiError(error);
  return jsonResponse(body, { status });
}

export function getApiKey(request: Request): string {
  const direct = request.headers.get("x-rh-key");
  const authorization = request.headers.get("authorization");

  let key = direct?.trim();
  if (!key && authorization) {
    key = authorization.replace(/^Bearer\s+/i, "").trim();
  }

  if (!key) {
    throw new AppError(401, "MISSING_KEY", "请先提供 API Key。", {
      hint: "在请求头中发送 x-rh-key，或使用 Authorization: Bearer。",
    });
  }

  if (key.length < 8 || key.length > 200 || /\s/.test(key)) {
    throw new AppError(401, "INVALID_KEY", "API Key 格式不正确。", {
      hint: "请重新复制完整的 API Key。",
    });
  }

  return key;
}

export async function readJsonBody<T>(
  request: Request,
  limit = 64 * 1024,
): Promise<T> {
  const text = await request.text();
  const bytes = new TextEncoder().encode(text).byteLength;

  if (bytes > limit) {
    throw new AppError(413, "BODY_TOO_LARGE", "请求体过大。", {
      hint: "请减少参数内容后重试。",
    });
  }
  if (!text.trim()) {
    throw new AppError(400, "INVALID_BODY", "请求体不能为空。");
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new AppError(400, "INVALID_JSON", "请求体必须是合法 JSON。");
  }
}

