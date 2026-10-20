import { AppError, redact } from "@/lib/errors";
import { normalizeSchema } from "@/lib/fields";
import type {
  AppSchema,
  JobStatus,
  JobView,
  NodeInput,
  OutputItem,
  RawNode,
} from "@/lib/types";

const DEFAULT_BASE_URL = "https://www.runninghub.cn";
const ALLOWED_HOSTS = new Set([
  "www.runninghub.cn",
  "runninghub.cn",
  "www.runninghub.ai",
  "runninghub.ai",
]);

export function getAppId(): string {
  const appId = process.env.RUNNINGHUB_WEBAPP_ID?.trim() ?? "";
  if (!appId) {
    throw new AppError(
      503,
      "APP_NOT_CONFIGURED",
      "站点还没有配置 RunningHub AI 应用。",
      {
        hint: "请在环境变量中设置 RUNNINGHUB_WEBAPP_ID，然后重新部署。",
      },
    );
  }
  if (!/^\d{5,30}$/.test(appId)) {
    throw new AppError(
      503,
      "APP_CONFIG_INVALID",
      "RUNNINGHUB_WEBAPP_ID 格式不正确。",
      { hint: "它应当是 /ai-detail/<id> 中的纯数字 ID。" },
    );
  }
  return appId;
}

export function isAppConfigured(): boolean {
  const appId = process.env.RUNNINGHUB_WEBAPP_ID?.trim() ?? "";
  return /^\d{5,30}$/.test(appId);
}

function baseUrl(): string {
  const configured =
    process.env.RUNNINGHUB_BASE_URL?.trim() || DEFAULT_BASE_URL;
  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    throw new AppError(503, "APP_CONFIG_INVALID", "RUNNINGHUB_BASE_URL 无效。");
  }

  const allowLocal =
    process.env.RH_ALLOW_LOCAL_MOCK === "1" &&
    (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost");

  if (!ALLOWED_HOSTS.has(parsed.hostname) && !allowLocal) {
    throw new AppError(
      503,
      "APP_CONFIG_INVALID",
      "RUNNINGHUB_BASE_URL 不在允许的域名列表中。",
    );
  }

  return parsed.origin.replace(/\/$/, "");
}

export function mapUpstreamError(data: unknown): AppError {
  const record =
    data && typeof data === "object"
      ? (data as Record<string, unknown>)
      : {};
  const numericCode = Number(record.code ?? 0);
  const message = String(
    record.msg ?? record.message ?? record.errorMessage ?? "",
  ).trim();
  const lower = message.toLowerCase();

  if (
    [401, 403, 1602, 806, 332].includes(numericCode) ||
    /apikey.*(not found|invalid)|user (does not exist|not exist)|unauthorized/i.test(message)
  ) {
    return new AppError(
      401,
      "INVALID_KEY",
      "RunningHub API Key 无效或已失效。",
      {
        hint: "请到 RunningHub API 控制台重新复制完整 Key。",
        upstreamCode: numericCode,
      },
    );
  }

  if (numericCode === 402 || /balance|余额|insufficient/i.test(lower)) {
    return new AppError(
      402,
      "INSUFFICIENT_BALANCE",
      "RunningHub 账户余额不足。",
      {
        hint: "请先在 RunningHub 充值，或更换有额度的 API Key。",
        upstreamCode: numericCode,
      },
    );
  }

  if (numericCode === 380 || /workflow not exists|app.*not (found|exist)/i.test(message)) {
    return new AppError(
      409,
      "APP_NOT_AVAILABLE",
      "这个 AI 应用当前不可用。",
      {
        hint: "请确认应用已发布，且 RUNNINGHUB_WEBAPP_ID 与发布后的 ID 一致。",
        upstreamCode: numericCode,
      },
    );
  }

  if (numericCode === 814 || /queue.*(limit|full)|排队/i.test(message)) {
    return new AppError(429, "QUEUE_FULL", "当前排队任务已满。", {
      hint: "稍等片刻再试，或减少同时提交的任务。",
      upstreamCode: numericCode,
    });
  }

  if (numericCode === 809 || /file.*(size|large)|too large/i.test(message)) {
    return new AppError(413, "FILE_TOO_LARGE", "上传文件过大。", {
      hint: "请上传 4MB 以内的音频或图片。",
      upstreamCode: numericCode,
    });
  }

  return new AppError(
    502,
    "UPSTREAM_ERROR",
    redact(message || "RunningHub 返回了未知错误。"),
    { upstreamCode: numericCode || undefined },
  );
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AppError(
      502,
      "UPSTREAM_BAD_RESPONSE",
      "RunningHub 返回了无法解析的响应。",
      { hint: redact(text.slice(0, 120)) },
    );
  }
}

async function rhFetch(
  path: string,
  init: RequestInit,
  timeoutMs = 30_000,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl()}${path}`, {
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
        "RunningHub 响应超时。",
        { hint: "请稍后重试；长时间生成不会影响已提交的任务。" },
      );
    }
    throw new AppError(
      502,
      "UPSTREAM_UNREACHABLE",
      "暂时无法连接 RunningHub。",
      { hint: "请检查网络或稍后重试。" },
    );
  }

  if (response.status === 404) {
    throw new AppError(404, "UPSTREAM_NOT_FOUND", "RunningHub 接口不存在。");
  }

  const data = await parseJsonResponse(response);
  if (!response.ok) {
    const record =
      data && typeof data === "object"
        ? { code: response.status, ...(data as Record<string, unknown>) }
        : { code: response.status, message: `RunningHub HTTP ${response.status}` };
    throw mapUpstreamError(record);
  }
  return data;
}

export async function fetchAppSchema(apiKey: string): Promise<AppSchema> {
  const appId = getAppId();
  // Validate the caller's key on every connection. A cross-request schema cache
  // would let an invalid key reuse another visitor's successful schema read.
  const query = new URLSearchParams({ apiKey, webappId: appId });
  const data = await rhFetch(`/api/webapp/apiCallDemo?${query.toString()}`, {
    method: "GET",
  });
  const record = data as Record<string, unknown>;
  if (Number(record.code ?? 0) !== 0) throw mapUpstreamError(record);

  const payload =
    record.data && typeof record.data === "object"
      ? (record.data as Record<string, unknown>)
      : {};
  const nodes = payload.nodeInfoList;

  if (!Array.isArray(nodes) || nodes.length === 0) {
    throw new AppError(
      409,
      "NO_NODES",
      "这个 AI 应用还没有暴露可调字段。",
      {
        hint: "请在 RunningHub 的应用发布设置中勾选提示词、歌词等输入节点。",
      },
    );
  }

  const schema = normalizeSchema(
    nodes as RawNode[],
    appId,
    String(payload.webappName ?? "RunningHub AI App"),
  );
  return schema;
}

export async function runApp(
  apiKey: string,
  nodeInfoList: NodeInput[],
): Promise<{ taskId: string; status: JobStatus }> {
  const appId = getAppId();
  // Keep the numeric app ID exact: Number() would round 19-digit IDs.
  const body = `{"apiKey":${JSON.stringify(apiKey)},"webappId":${appId},"nodeInfoList":${JSON.stringify(nodeInfoList)}}`;
  const data = await rhFetch("/task/openapi/ai-app/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  const record = data as Record<string, unknown>;
  if (Number(record.code ?? 0) !== 0) throw mapUpstreamError(record);

  const payload =
    record.data && typeof record.data === "object"
      ? (record.data as Record<string, unknown>)
      : {};
  const taskId = payload.taskId;
  if (!taskId) {
    throw new AppError(
      502,
      "UPSTREAM_ERROR",
      "RunningHub 没有返回任务 ID。",
    );
  }

  const promptTips = payload.promptTips;
  if (typeof promptTips === "string" && promptTips.includes("node_errors")) {
    try {
      const tips = JSON.parse(promptTips) as {
        node_errors?: Record<string, unknown>;
      };
      if (tips.node_errors && Object.keys(tips.node_errors).length > 0) {
        throw new AppError(
          422,
          "NODE_VALIDATION",
          "工作流节点校验未通过。",
          { hint: "请检查提示词、歌词或模型参数后再试。" },
        );
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
    }
  }

  const rawStatus = String(payload.taskStatus ?? "QUEUED").toUpperCase();
  const status: JobStatus =
    rawStatus === "RUNNING" || rawStatus === "FAILED" ? rawStatus : "QUEUED";

  return { taskId: String(taskId), status };
}

function guessType(url: string): string {
  const path = url.split("?")[0].split("#")[0];
  const extension = path.split(".").pop();
  return extension ? extension.toLowerCase() : "file";
}

export async function queryTask(
  apiKey: string,
  taskId: string,
): Promise<JobView> {
  const data = await rhFetch("/openapi/v2/query", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ taskId }),
  });

  const outer = data as Record<string, unknown>;
  if (Number(outer.code ?? 0) !== 0 && !outer.data) throw mapUpstreamError(outer);
  const payload =
    outer.data && typeof outer.data === "object" && !Array.isArray(outer.data)
      ? (outer.data as Record<string, unknown>)
      : outer;

  const errorCode = String(payload.errorCode ?? "");
  if ([ "806", "1602", "332" ].includes(errorCode)) {
    throw new AppError(
      401,
      "INVALID_KEY",
      "RunningHub API Key 无效或已失效。",
      { hint: "请重新连接你的 RunningHub 账户。" },
    );
  }

  const statusText = String(payload.status ?? "").toUpperCase();
  const status: JobStatus =
    statusText === "SUCCESS" ||
    statusText === "FAILED" ||
    statusText === "CANCELLED" ||
    statusText === "QUEUED"
      ? statusText
      : "RUNNING";

  const outputs: OutputItem[] = [];
  if (Array.isArray(payload.results)) {
    for (const item of payload.results) {
      if (!item || typeof item !== "object") continue;
      const output = item as Record<string, unknown>;
      const url = String(output.url ?? output.fileUrl ?? "");
      if (!url) continue;
      outputs.push({
        url,
        type: String(output.outputType ?? output.fileType ?? guessType(url)),
      });
    }
  }

  let jobError: JobView["error"] = null;
  if (status === "FAILED" || payload.errorMessage) {
    const failedReason = payload.failedReason;
    const reason =
      failedReason && typeof failedReason === "object"
        ? (failedReason as Record<string, unknown>)
        : {};
    jobError = {
      code: String(payload.errorCode ?? "TASK_FAILED"),
      message:
        String(payload.errorMessage ?? reason.exception_message ?? "").trim() ||
        "任务执行失败。",
      hint:
        String(reason.node_name ?? reason.node_id ?? "").trim() ||
        undefined,
    };
  }

  const usageRaw =
    payload.usage && typeof payload.usage === "object"
      ? (payload.usage as Record<string, unknown>)
      : null;
  const usage = usageRaw
    ? {
        cost: String(
          usageRaw.consumeMoney ??
            usageRaw.thirdPartyConsumeMoney ??
            usageRaw.consumeCoins ??
            "",
        ),
        durationSeconds: Number(usageRaw.taskCostTime ?? 0) || undefined,
      }
    : null;

  return {
    providerId: "runninghub",
    taskId,
    status,
    outputs,
    error: jobError,
    usage,
  };
}

export async function cancelTask(
  apiKey: string,
  taskId: string,
): Promise<boolean> {
  const data = await rhFetch("/task/openapi/cancel", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ apiKey, taskId }),
  });
  const record = data as Record<string, unknown>;
  if (Number(record.code ?? 0) !== 0) {
    const message = String(record.msg ?? "").toLowerCase();
    if (/finish|complete|结束|完成/.test(message)) {
      return false;
    }
    throw mapUpstreamError(record);
  }
  return true;
}

export async function uploadMedia(
  apiKey: string,
  file: File,
): Promise<{ fileName: string; url?: string }> {
  const form = new FormData();
  form.append("file", file, file.name);

  const response = await fetch(
    `${baseUrl()}/openapi/v2/media/upload/binary`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}` },
      body: form,
      cache: "no-store",
      signal: AbortSignal.timeout(45_000),
    },
  ).catch(() => {
    throw new AppError(502, "UPLOAD_FAILED", "上传文件时无法连接 RunningHub。");
  });

  if (response.status !== 404) {
    const data = await parseJsonResponse(response);
    const record = data as Record<string, unknown>;
    if (Number(record.code ?? 0) === 0) {
      const payload =
        record.data && typeof record.data === "object"
          ? (record.data as Record<string, unknown>)
          : {};
      const fileName = String(
        payload.fileName ?? payload.file_name ?? payload.filename ?? "",
      );
      if (fileName) {
        return {
          fileName,
          url: String(
            payload.url ?? payload.download_url ?? payload.downloadUrl ?? "",
          ) || undefined,
        };
      }
    } else {
      throw mapUpstreamError(record);
    }
  }

  const legacyForm = new FormData();
  legacyForm.append("apiKey", apiKey);
  legacyForm.append("file", file, file.name);
  const legacyResponse = await fetch(`${baseUrl()}/task/openapi/upload`, {
    method: "POST",
    body: legacyForm,
    cache: "no-store",
    signal: AbortSignal.timeout(45_000),
  }).catch(() => {
    throw new AppError(502, "UPLOAD_FAILED", "上传文件时无法连接 RunningHub。");
  });
  const legacyData = await parseJsonResponse(legacyResponse);
  const legacy = legacyData as Record<string, unknown>;
  if (Number(legacy.code ?? 0) !== 0) throw mapUpstreamError(legacy);
  const legacyPayload =
    legacy.data && typeof legacy.data === "object"
      ? (legacy.data as Record<string, unknown>)
      : {};
  const fileName = String(
    legacyPayload.fileName ??
      legacyPayload.file_name ??
      legacyPayload.filename ??
      "",
  );
  if (!fileName) {
    throw new AppError(502, "UPLOAD_FAILED", "RunningHub 没有返回文件名。");
  }
  return {
    fileName,
    url:
      String(
        legacyPayload.url ??
          legacyPayload.download_url ??
          legacyPayload.downloadUrl ??
          "",
      ) || undefined,
  };
}

