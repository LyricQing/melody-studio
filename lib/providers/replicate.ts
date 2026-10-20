import { AppError, redact } from "@/lib/errors";
import {
  applyInputMap,
  fixedSchema,
  upstreamJsonFetch,
} from "@/lib/providers/shared";
import type { ProviderAdapter } from "@/lib/providers/types";
import type { AppSchema, JobStatus, JobView, OutputItem, Values } from "@/lib/types";

const PROVIDER_NAME = "Replicate";
const API_BASE = "https://api.replicate.com";

const DEFAULT_INPUT_MAP: Record<string, string> = {
  prompt: "prompt",
  lyrics: "lyrics",
  style: "style",
  duration: "duration",
  instrumental: "instrumental",
};

function modelSpec(): string {
  const model = process.env.REPLICATE_MODEL?.trim() ?? "";
  if (!model) {
    throw new AppError(
      503,
      "PROVIDER_CONFIG_INVALID",
      "站点还没有配置 Replicate 模型。",
      { hint: "请在环境变量中设置 REPLICATE_MODEL，例如 owner/name 或 owner/name:version。" },
    );
  }
  if (!/^[\w.-]+\/[\w.-]+(:[\w.-]+)?$/.test(model)) {
    throw new AppError(
      503,
      "PROVIDER_CONFIG_INVALID",
      "REPLICATE_MODEL 格式不正确。",
      { hint: "它应当形如 owner/name 或 owner/name:version。" },
    );
  }
  return model;
}

function isConfigured(): boolean {
  return /^[\w.-]+\/[\w.-]+(:[\w.-]+)?$/.test(process.env.REPLICATE_MODEL?.trim() ?? "");
}

function authHeaders(apiKey: string): HeadersInit {
  return {
    "content-type": "application/json",
    authorization: `Bearer ${apiKey}`,
  };
}

function mapHttpError(status: number, data: unknown): AppError {
  const record =
    data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const detail = record.detail ?? record.title ?? record.message ?? "";
  const message = String(
    typeof detail === "string"
      ? detail
      : Array.isArray(detail) && detail[0] && typeof detail[0] === "object"
        ? (detail[0] as Record<string, unknown>).msg ?? JSON.stringify(detail[0])
        : "",
  ).trim();

  if (status === 401 || status === 403) {
    return new AppError(401, "INVALID_KEY", "Replicate API Token 无效或已失效。", {
      hint: "请到 Replicate 账户设置重新复制 API Token。",
    });
  }
  if (status === 402 || /insufficient.*(credit|balance)/i.test(message)) {
    return new AppError(402, "INSUFFICIENT_BALANCE", "Replicate 账户额度不足。", {
      hint: "请先在 Replicate 充值，或更换有额度的 API Token。",
    });
  }
  if (status === 404) {
    return new AppError(404, "UPSTREAM_NOT_FOUND", "Replicate 模型或任务不存在。", {
      hint: "请检查 REPLICATE_MODEL 配置或任务 ID 是否正确。",
    });
  }
  if (status === 422) {
    return new AppError(422, "INVALID_FIELD", redact(message || "Replicate 拒绝了提交的参数。"), {
      hint: "请检查提示词、歌词等参数后重试。",
    });
  }
  if (status === 429) {
    return new AppError(429, "QUEUE_FULL", "Replicate 请求过于频繁。", {
      hint: "稍等片刻再试。",
    });
  }
  return new AppError(
    502,
    "UPSTREAM_ERROR",
    redact(message || `Replicate HTTP ${status}`),
  );
}

function outputType(url: string): string {
  const path = url.split("?")[0].split("#")[0];
  const extension = path.split(".").pop();
  return extension && extension.length <= 5 ? extension.toLowerCase() : "file";
}

function collectOutputs(raw: unknown): OutputItem[] {
  const urls = Array.isArray(raw) ? raw : [raw];
  const outputs: OutputItem[] = [];
  for (const item of urls) {
    if (typeof item !== "string" || !/^https?:\/\//i.test(item)) continue;
    outputs.push({ url: item, type: outputType(item) });
  }
  return outputs;
}

function statusFromPrediction(value: unknown): JobStatus {
  switch (String(value ?? "").toLowerCase()) {
    case "starting": return "QUEUED";
    case "processing": return "RUNNING";
    case "succeeded": return "SUCCESS";
    case "failed": return "FAILED";
    case "canceled": return "CANCELLED";
    default: return "RUNNING";
  }
}

export const replicateProvider: ProviderAdapter = {
  summary: {
    id: "replicate",
    name: PROVIDER_NAME,
    kind: "replicate",
    description: "通过 Replicate 运行社区与官方音乐生成模型",
    get configured() {
      return isConfigured();
    },
    keyLabel: "Replicate API Token",
    docsUrl: "https://replicate.com/docs/reference/http",
    get modelLabel() {
      const model = process.env.REPLICATE_MODEL?.trim() ?? "";
      const withoutVersion = model.split(":")[0] ?? model;
      return withoutVersion || undefined;
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
    return fixedSchema("replicate", PROVIDER_NAME, modelSpec().split(":")[0] ?? "");
  },

  async generate(apiKey: string, values: Values): Promise<JobView> {
    const input = applyInputMap(values, DEFAULT_INPUT_MAP, "REPLICATE_INPUT_MAP");
    const model = modelSpec();
    const [ownerName, version] = model.split(":");
    const body = version
      ? { version, input }
      : { model: ownerName, input };

    const { status, data } = await upstreamJsonFetch(PROVIDER_NAME, `${API_BASE}/v1/predictions`, {
      method: "POST",
      headers: authHeaders(apiKey),
      body: JSON.stringify(body),
    });
    if (status >= 400) throw mapHttpError(status, data);

    const record = data as Record<string, unknown>;
    const taskId = String(record.id ?? "");
    if (!taskId) {
      throw new AppError(502, "UPSTREAM_ERROR", "Replicate 没有返回任务 ID。");
    }
    return {
      providerId: "replicate",
      taskId,
      status: statusFromPrediction(record.status),
      outputs: record.status === "succeeded" ? collectOutputs(record.output) : [],
      error: null,
      usage: null,
    };
  },

  async getJob(apiKey: string, taskId: string): Promise<JobView> {
    const { status, data } = await upstreamJsonFetch(
      PROVIDER_NAME,
      `${API_BASE}/v1/predictions/${encodeURIComponent(taskId)}`,
      { method: "GET", headers: authHeaders(apiKey) },
    );
    if (status >= 400) throw mapHttpError(status, data);

    const record = data as Record<string, unknown>;
    const jobStatus = statusFromPrediction(record.status);
    const outputs = jobStatus === "SUCCESS" ? collectOutputs(record.output) : [];

    let error: JobView["error"] = null;
    if (jobStatus === "FAILED") {
      error = {
        code: String(record.error_code ?? "TASK_FAILED"),
        message:
          String(record.error ?? "任务执行失败。").trim() || "任务执行失败。",
      };
    }

    const metrics =
      record.metrics && typeof record.metrics === "object"
        ? (record.metrics as Record<string, unknown>)
        : null;

    return {
      providerId: "replicate",
      taskId,
      status: jobStatus,
      outputs,
      error,
      usage: metrics
        ? {
            durationSeconds: Number(metrics.predict_time ?? 0) || undefined,
          }
        : null,
    };
  },

  async cancel(apiKey: string, taskId: string): Promise<boolean> {
    const { status, data } = await upstreamJsonFetch(
      PROVIDER_NAME,
      `${API_BASE}/v1/predictions/${encodeURIComponent(taskId)}/cancel`,
      { method: "POST", headers: authHeaders(apiKey), body: JSON.stringify({}) },
    );
    if (status >= 400) {
      if (status === 404 || status === 409) return false;
      throw mapHttpError(status, data);
    }
    return true;
  },
};
