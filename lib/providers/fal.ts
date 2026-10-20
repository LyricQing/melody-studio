import { AppError, redact } from "@/lib/errors";
import {
  applyInputMap,
  fixedSchema,
  upstreamJsonFetch,
} from "@/lib/providers/shared";
import type { ProviderAdapter } from "@/lib/providers/types";
import type { AppSchema, JobStatus, JobView, OutputItem, Values } from "@/lib/types";

const PROVIDER_NAME = "fal.ai";
const API_BASE = "https://queue.fal.run";

const DEFAULT_INPUT_MAP: Record<string, string> = {
  prompt: "prompt",
  lyrics: "lyrics",
  style: "style",
  duration: "duration",
  instrumental: "instrumental",
  voice: "voice",
};

const MODEL_PATTERN = /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+$/;

function modelSpec(): string {
  const model = process.env.FAL_MODEL?.trim() ?? "";
  if (!model) {
    throw new AppError(
      503,
      "PROVIDER_CONFIG_INVALID",
      "站点还没有配置 fal.ai 模型。",
      { hint: "请在环境变量中设置 FAL_MODEL，例如 fal-ai/stable-audio。" },
    );
  }
  if (!MODEL_PATTERN.test(model)) {
    throw new AppError(
      503,
      "PROVIDER_CONFIG_INVALID",
      "FAL_MODEL 格式不正确。",
      { hint: "它应当形如 fal-ai/stable-audio。" },
    );
  }
  return model;
}

function isConfigured(): boolean {
  return MODEL_PATTERN.test(process.env.FAL_MODEL?.trim() ?? "");
}

function authHeaders(apiKey: string): HeadersInit {
  return {
    "content-type": "application/json",
    authorization: `Key ${apiKey}`,
  };
}

function extractDetail(data: unknown): string {
  const record =
    data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const detail = record.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail[0] && typeof detail[0] === "object") {
    const first = detail[0] as Record<string, unknown>;
    return String(first.msg ?? "");
  }
  return String(record.message ?? record.error ?? "");
}

function mapHttpError(status: number, data: unknown): AppError {
  const message = extractDetail(data);

  if (status === 401 || status === 403) {
    return new AppError(401, "INVALID_KEY", "fal.ai API Key 无效或已失效。", {
      hint: "请到 fal.ai 控制台重新复制 API Key。",
    });
  }
  if (status === 402 || /insufficient|quota|balance/i.test(message)) {
    return new AppError(402, "INSUFFICIENT_BALANCE", "fal.ai 账户额度不足。", {
      hint: "请先在 fal.ai 充值，或更换有额度的 API Key。",
    });
  }
  if (status === 404) {
    return new AppError(404, "UPSTREAM_NOT_FOUND", "fal.ai 模型或任务不存在。", {
      hint: "请检查 FAL_MODEL 配置或任务 ID 是否正确。",
    });
  }
  if (status === 422) {
    return new AppError(422, "INVALID_FIELD", redact(message || "fal.ai 拒绝了提交的参数。"), {
      hint: "请检查提示词、歌词等参数后重试。",
    });
  }
  if (status === 429) {
    return new AppError(429, "QUEUE_FULL", "fal.ai 请求过于频繁。", {
      hint: "稍等片刻再试。",
    });
  }
  return new AppError(
    502,
    "UPSTREAM_ERROR",
    redact(message || `fal.ai HTTP ${status}`),
  );
}

function statusFromFal(value: unknown): JobStatus {
  switch (String(value ?? "").toUpperCase()) {
    case "IN_QUEUE": return "QUEUED";
    case "IN_PROGRESS": return "RUNNING";
    case "COMPLETED": return "SUCCESS";
    case "OK": return "SUCCESS";
    case "ERROR": return "FAILED";
    default: return "RUNNING";
  }
}

function contentTypeToType(contentType: string, url: string): string {
  if (contentType.startsWith("audio/")) {
    const subtype = contentType.slice(6).split(";")[0].trim();
    if (subtype === "mpeg") return "mp3";
    if (subtype === "x-wav" || subtype === "wave") return "wav";
    if (subtype === "x-m4a" || subtype === "mp4") return "m4a";
    if (subtype) return subtype;
    return "mp3";
  }
  const path = url.split("?")[0].split("#")[0];
  const extension = path.split(".").pop();
  return extension && extension.length <= 5 ? extension.toLowerCase() : "file";
}

function collectOutputs(node: unknown, depth = 0, sink: OutputItem[] = []): OutputItem[] {
  if (depth > 6 || node === null || node === undefined) return sink;

  if (Array.isArray(node)) {
    for (const item of node) collectOutputs(item, depth + 1, sink);
    return sink;
  }
  if (typeof node !== "object") return sink;

  const record = node as Record<string, unknown>;
  const url = record.url;
  if (typeof url === "string" && /^https?:\/\//i.test(url)) {
    const contentType = typeof record.content_type === "string" ? record.content_type : "";
    sink.push({ url, type: contentTypeToType(contentType, url) });
    return sink;
  }
  for (const value of Object.values(record)) {
    collectOutputs(value, depth + 1, sink);
  }
  return sink;
}

export const falProvider: ProviderAdapter = {
  summary: {
    id: "fal",
    name: PROVIDER_NAME,
    kind: "fal",
    description: "通过 fal.ai 队列运行快速音乐与音频模型",
    get configured() {
      return isConfigured();
    },
    keyLabel: "fal.ai API Key",
    docsUrl: "https://docs.fal.ai/model-endpoints/queue",
    get modelLabel() {
      return process.env.FAL_MODEL?.trim() || undefined;
    },
    capabilities: {
      dynamicSchema: false,
      uploads: false,
      cancellation: true,
      directOutput: false,
    },
  },

  async getSchema(apiKey: string): Promise<AppSchema> {
    void apiKey;
    return fixedSchema("fal", PROVIDER_NAME, modelSpec());
  },

  async generate(apiKey: string, values: Values): Promise<JobView> {
    const model = modelSpec();
    const input = applyInputMap(values, DEFAULT_INPUT_MAP, "FAL_INPUT_MAP");

    const { status, data } = await upstreamJsonFetch(PROVIDER_NAME, `${API_BASE}/${model}`, {
      method: "POST",
      headers: authHeaders(apiKey),
      body: JSON.stringify(input),
    });
    if (status >= 400) throw mapHttpError(status, data);

    const record = data as Record<string, unknown>;
    const taskId = String(record.request_id ?? "");
    if (!taskId) {
      throw new AppError(502, "UPSTREAM_ERROR", "fal.ai 没有返回任务 ID。");
    }
    return {
      providerId: "fal",
      taskId,
      status: statusFromFal(record.status ?? "IN_QUEUE"),
      outputs: [],
      error: null,
      usage: null,
    };
  },

  async getJob(apiKey: string, taskId: string): Promise<JobView> {
    const model = modelSpec();
    const base = `${API_BASE}/${model}/requests/${encodeURIComponent(taskId)}`;

    const { status, data } = await upstreamJsonFetch(
      PROVIDER_NAME,
      `${base}/status`,
      { method: "GET", headers: authHeaders(apiKey) },
    );
    if (status >= 400) throw mapHttpError(status, data);

    const record = data as Record<string, unknown>;
    const jobStatus = statusFromFal(record.status);
    if (jobStatus !== "SUCCESS") {
      return {
        providerId: "fal",
        taskId,
        status: jobStatus,
        outputs: [],
        error: null,
        usage: null,
      };
    }

    const result = await upstreamJsonFetch(PROVIDER_NAME, base, {
      method: "GET",
      headers: authHeaders(apiKey),
    });
    if (result.status >= 400) throw mapHttpError(result.status, result.data);

    return {
      providerId: "fal",
      taskId,
      status: "SUCCESS",
      outputs: collectOutputs(result.data),
      error: null,
      usage: null,
    };
  },

  async cancel(apiKey: string, taskId: string): Promise<boolean> {
    const model = modelSpec();
    const { status, data } = await upstreamJsonFetch(
      PROVIDER_NAME,
      `${API_BASE}/${model}/requests/${encodeURIComponent(taskId)}/cancel`,
      { method: "PUT", headers: authHeaders(apiKey) },
    );
    if (status >= 400) {
      if (status === 404 || status === 409) return false;
      throw mapHttpError(status, data);
    }
    return true;
  },
};
