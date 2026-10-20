import { AppError, redact } from "@/lib/errors";
import {
  envValue,
  fixedSchema,
  parseInputMap,
  providerTaskId,
  validateFixedValues,
} from "@/lib/providers/shared";
import type { ProviderAdapter } from "@/lib/providers/types";
import type { AppSchema, JobView, Values } from "@/lib/types";

const PROVIDER_NAME = "OpenAI 兼容音频";
const DEFAULT_MODEL = "gpt-4o-mini-tts";
const MAX_AUDIO_BYTES = 12 * 1024 * 1024;
const GENERATE_TIMEOUT_MS = 120_000;

const DEFAULT_INPUT_MAP: Record<string, string> = {
  prompt: "input",
  lyrics: "input",
  style: "instructions",
  voice: "voice",
};

function baseUrl(): string {
  const raw = envValue("OPENAI_AUDIO_BASE_URL");
  if (!raw) {
    throw new AppError(
      503,
      "PROVIDER_CONFIG_INVALID",
      "站点还没有配置 OpenAI 兼容音频服务。",
      { hint: "请在环境变量中设置 OPENAI_AUDIO_BASE_URL，例如 https://api.openai.com。" },
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new AppError(
      503,
      "PROVIDER_CONFIG_INVALID",
      "OPENAI_AUDIO_BASE_URL 无效。",
      { hint: "它必须是合法的 http(s) 地址。" },
    );
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new AppError(503, "PROVIDER_CONFIG_INVALID", "OPENAI_AUDIO_BASE_URL 必须是 http(s) 地址。");
  }
  return parsed.origin;
}

function modelSpec(): string {
  const model = envValue("OPENAI_AUDIO_MODEL") || DEFAULT_MODEL;
  if (!/^[\w.-]{1,80}$/.test(model)) {
    throw new AppError(
      503,
      "PROVIDER_CONFIG_INVALID",
      "OPENAI_AUDIO_MODEL 格式不正确。",
      { hint: "模型名称只应包含字母、数字与点横线。" },
    );
  }
  return model;
}

function isConfigured(): boolean {
  const raw = envValue("OPENAI_AUDIO_BASE_URL");
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

async function mapSpeechError(response: Response): Promise<AppError> {
  let message = "";
  let code = "";
  try {
    const data = (await response.json()) as Record<string, unknown>;
    const error =
      data.error && typeof data.error === "object"
        ? (data.error as Record<string, unknown>)
        : data;
    message = String(error.message ?? "");
    code = String(error.code ?? "");
  } catch {
    message = "";
  }

  if (response.status === 401 || response.status === 403) {
    return new AppError(401, "INVALID_KEY", "API Key 无效或已失效。", {
      hint: "请重新复制提供商提供的 API Key。",
    });
  }
  if (
    response.status === 402 ||
    code === "insufficient_quota" ||
    /insufficient|quota|balance/i.test(message)
  ) {
    return new AppError(402, "INSUFFICIENT_BALANCE", "账户额度不足。", {
      hint: "请先在提供商控制台充值，或更换有额度的 API Key。",
    });
  }
  if (response.status === 429) {
    return new AppError(429, "QUEUE_FULL", "请求过于频繁。", { hint: "稍等片刻再试。" });
  }
  if (response.status === 400 || response.status === 422) {
    return new AppError(422, "INVALID_FIELD", redact(message || "提供商拒绝了提交的参数。"));
  }
  return new AppError(
    502,
    "UPSTREAM_ERROR",
    redact(message || `上游 HTTP ${response.status}`),
  );
}

function buildSpeechPayload(values: Values): Record<string, unknown> {
  const normalized = validateFixedValues(values);
  const mapping = {
    ...DEFAULT_INPUT_MAP,
    ...parseInputMap("OPENAI_AUDIO_INPUT_MAP"),
  };

  const model = modelSpec();
  const inputKey = mapping.lyrics || mapping.prompt || "input";
  const voiceKey = mapping.voice || "voice";
  const instructionKey = mapping.style || "instructions";

  const payload: Record<string, unknown> = {
    model,
    response_format: "mp3",
    [voiceKey]: String(normalized.voice ?? "alloy"),
  };
  // Lyrics win over the plain prompt when both are provided.
  payload[inputKey] = String(normalized.lyrics ?? normalized.prompt ?? "");
  if (normalized.style) payload[instructionKey] = normalized.style;
  return payload;
}

export const openaiAudioProvider: ProviderAdapter = {
  summary: {
    id: "openai-audio",
    name: PROVIDER_NAME,
    kind: "openai-audio",
    description: "通过 OpenAI 兼容的音频接口直接合成，结果即时返回",
    get configured() {
      return isConfigured();
    },
    keyLabel: "API Key",
    docsUrl: "https://platform.openai.com/docs/guides/text-to-speech",
    get modelLabel() {
      return envValue("OPENAI_AUDIO_MODEL") || DEFAULT_MODEL;
    },
    capabilities: {
      dynamicSchema: false,
      uploads: false,
      cancellation: false,
      directOutput: true,
    },
  },

  async getSchema(apiKey: string): Promise<AppSchema> {
    void apiKey;
    return fixedSchema("openai-audio", PROVIDER_NAME, modelSpec(), { includeVoice: true });
  },

  async generate(apiKey: string, values: Values): Promise<JobView> {
    const url = `${baseUrl()}/v1/audio/speech`;
    const payload = buildSpeechPayload(values);

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
        cache: "no-store",
        signal: AbortSignal.timeout(GENERATE_TIMEOUT_MS),
      });
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      if (name === "TimeoutError" || name === "AbortError") {
        throw new AppError(504, "UPSTREAM_TIMEOUT", "音频合成响应超时。", {
          hint: "请缩短时长或稍后重试。",
        });
      }
      throw new AppError(502, "UPSTREAM_UNREACHABLE", `暂时无法连接音频服务。`);
    }

    if (!response.ok) throw await mapSpeechError(response);

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength === 0) {
      throw new AppError(502, "UPSTREAM_BAD_RESPONSE", "音频服务返回了空内容。");
    }
    if (buffer.byteLength > MAX_AUDIO_BYTES) {
      throw new AppError(413, "FILE_TOO_LARGE", "返回的音频过大。", {
        hint: "请缩短生成时长后重试。",
      });
    }

    const base64 = Buffer.from(buffer).toString("base64");
    return {
      providerId: "openai-audio",
      taskId: providerTaskId("oa"),
      status: "SUCCESS",
      outputs: [{ url: `data:audio/mpeg;base64,${base64}`, type: "mp3" }],
      error: null,
      usage: null,
    };
  },

  async getJob(apiKey: string, taskId: string): Promise<JobView> {
    void apiKey;
    // Instant provider: generation finished inside the original request, so the
    // only meaningful answer is a terminal view. Client never polls these.
    return {
      providerId: "openai-audio",
      taskId,
      status: "SUCCESS",
      outputs: [],
      error: null,
      usage: null,
    };
  },

  async cancel(apiKey: string, taskId: string): Promise<boolean> {
    void apiKey;
    void taskId;
    return false;
  },
};
