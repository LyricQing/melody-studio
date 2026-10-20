import { AppError, redact } from "@/lib/errors";
import type { AppSchema, Field, JobStatus, Values } from "@/lib/types";

export function envValue(name: string): string {
  return process.env[name]?.trim() ?? "";
}

export function parseEnvObject(name: string): Record<string, unknown> {
  const raw = envValue(name);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Expected a JSON object");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    throw new AppError(503, "PROVIDER_CONFIG_INVALID", `${name} 必须是合法 JSON 对象。`, {
      cause: error,
    });
  }
}

export function parseInputMap(envName: string): Record<string, string> {
  const source = parseEnvObject(envName);
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === "string" && value.trim()) result[key] = value.trim();
  }
  return result;
}

export function fixedSchema(
  providerId: string,
  providerName: string,
  modelLabel: string,
  options: { includeVoice?: boolean } = {},
): AppSchema {
  const fields: Field[] = [
    {
      key: "prompt",
      nodeId: "provider",
      fieldName: "prompt",
      nodeName: "Prompt",
      label: "音乐描述",
      help: "描述风格、情绪、乐器、人声和场景",
      type: "textarea",
      defaultValue: "温暖清澈的独立民谣，木吉他，轻柔女声",
      group: "primary",
    },
    {
      key: "lyrics",
      nodeId: "provider",
      fieldName: "lyrics",
      nodeName: "Lyrics",
      label: "歌词",
      help: "可留空；填写时建议用换行区分段落",
      type: "textarea",
      defaultValue: "",
      group: "primary",
    },
    {
      key: "style",
      nodeId: "provider",
      fieldName: "style",
      nodeName: "Style",
      label: "音乐风格",
      help: "例如 folk、pop、jazz、electronic",
      type: "text",
      defaultValue: "folk",
      group: "primary",
    },
    {
      key: "duration",
      nodeId: "provider",
      fieldName: "duration",
      nodeName: "Duration",
      label: "时长（秒）",
      help: "建议先使用 30 秒进行测试",
      type: "number",
      defaultValue: 30,
      group: "primary",
    },
    {
      key: "instrumental",
      nodeId: "provider",
      fieldName: "instrumental",
      nodeName: "Instrumental",
      label: "纯音乐",
      help: "开启后不应再填写歌词",
      type: "boolean",
      defaultValue: false,
      group: "advanced",
    },
    ...(options.includeVoice
      ? [{
          key: "voice",
          nodeId: "provider",
          fieldName: "voice",
          nodeName: "Voice",
          label: "声音",
          help: "使用服务商支持的声音名称",
          type: "text" as const,
          defaultValue: "alloy",
          group: "advanced" as const,
        }]
      : []),
  ];

  return {
    appId: providerId,
    appName: `${providerName} · ${modelLabel}`,
    providerId,
    providerName,
    fields,
  };
}
export function validateFixedValues(values: Values): Record<string, string | number | boolean> {
  const allowed = new Set(["prompt", "lyrics", "style", "duration", "instrumental", "voice"]);
  const result: Record<string, string | number | boolean> = {};

  for (const [key, value] of Object.entries(values)) {
    if (!allowed.has(key)) continue;
    if (key === "duration") {
      const duration = Number(value);
      if (!Number.isFinite(duration) || duration < 1 || duration > 600) {
        throw new AppError(400, "INVALID_FIELD", "时长必须在 1 到 600 秒之间。");
      }
      result[key] = Math.round(duration);
      continue;
    }
    if (key === "instrumental") {
      result[key] = Boolean(value);
      continue;
    }
    const text = String(value ?? "").trim();
    if (text.length > 12000) {
      throw new AppError(400, "FIELD_TOO_LONG", "输入内容过长，请精简后重试。");
    }
    if (text) result[key] = text;
  }

  if (!Object.keys(result).some((key) => key !== "instrumental" && key !== "duration")) {
    throw new AppError(400, "EMPTY_INPUT", "请至少填写音乐描述或歌词。");
  }
  return result;
}

export function applyInputMap(
  values: Values,
  defaultMap: Record<string, string>,
  envName: string,
): Record<string, string | number | boolean> {
  const normalized = validateFixedValues(values);
  const mapping = { ...defaultMap, ...parseInputMap(envName) };
  const input: Record<string, string | number | boolean> = {};

  for (const [logicalKey, value] of Object.entries(normalized)) {
    const target = mapping[logicalKey];
    if (target) input[target] = value;
  }
  return input;
}

export function resolveStatus(value: unknown): JobStatus {
  const status = String(value ?? "").toUpperCase();
  if (["QUEUED", "PENDING", "STARTING", "IN_QUEUE"].includes(status)) return "QUEUED";
  if (["RUNNING", "PROCESSING", "IN_PROGRESS"].includes(status)) return "RUNNING";
  if (["SUCCESS", "SUCCEEDED", "COMPLETED", "COMPLETE"].includes(status)) return "SUCCESS";
  if (["FAILED", "ERROR"].includes(status)) return "FAILED";
  if (["CANCELLED", "CANCELED"].includes(status)) return "CANCELLED";
  return "RUNNING";
}

/**
 * Shared upstream JSON fetch with timeout / reachability / parse errors mapped
 * to provider-neutral AppErrors. Status-specific mapping stays per adapter.
 */
export async function upstreamJsonFetch(
  providerName: string,
  url: string,
  init: RequestInit,
  timeoutMs = 30_000,
): Promise<{ status: number; data: unknown }> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      throw new AppError(
        504,
        "UPSTREAM_TIMEOUT",
        `${providerName} 响应超时。`,
        { hint: "请稍后重试；已提交的任务不受影响。" },
      );
    }
    throw new AppError(
      502,
      "UPSTREAM_UNREACHABLE",
      `暂时无法连接 ${providerName}。`,
      { hint: "请检查网络或稍后重试。" },
    );
  }

  const text = await response.text();
  let data: unknown = {};
  if (text.trim()) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new AppError(
        502,
        "UPSTREAM_BAD_RESPONSE",
        `${providerName} 返回了无法解析的响应。`,
        { hint: redact(text.slice(0, 120)) },
      );
    }
  }
  return { status: response.status, data };
}

export function providerTaskId(prefix: string): string {
  const random = crypto.randomUUID().replace(/-/g, "").slice(0, 20);
  return `${prefix}-${random}`;
}

