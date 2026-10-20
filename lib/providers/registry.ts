import { AppError } from "@/lib/errors";
import type { ProviderAdapter } from "@/lib/providers/types";
import type { ProviderKind, ProviderSummary } from "@/lib/types";
import { falProvider } from "@/lib/providers/fal";
import { openaiAudioProvider } from "@/lib/providers/openai-audio";
import { replicateProvider } from "@/lib/providers/replicate";
import { runningHubProvider } from "@/lib/providers/runninghub";

export const DEFAULT_PROVIDER_ID = "runninghub";

const ADAPTERS: Record<ProviderKind, ProviderAdapter> = {
  runninghub: runningHubProvider,
  replicate: replicateProvider,
  fal: falProvider,
  "openai-audio": openaiAudioProvider,
};

/** All providers with their live `configured` flag; callers decide filtering. */
export function listProviders(): ProviderSummary[] {
  return Object.values(ADAPTERS).map((adapter) => adapter.summary);
}

export function getProvider(id: string): ProviderAdapter | null {
  const adapter = ADAPTERS[id as ProviderKind];
  if (!adapter || !adapter.summary.configured) return null;
  return adapter;
}

/**
 * Provider resolution order: body `providerId` > `x-provider-id` header >
 * `?provider=` query param > default RunningHub.
 */
export function resolveProviderId(request: Request, bodyProviderId?: unknown): string {
  if (typeof bodyProviderId === "string" && bodyProviderId.trim()) {
    return bodyProviderId.trim();
  }
  const header = request.headers.get("x-provider-id")?.trim();
  if (header) return header;

  try {
    const query = new URL(request.url).searchParams.get("provider")?.trim();
    if (query) return query;
  } catch {
    // Malformed request URL falls through to the default provider.
  }
  return DEFAULT_PROVIDER_ID;
}

export function requireProvider(id: string): ProviderAdapter {
  const adapter = ADAPTERS[id as ProviderKind];
  if (!adapter) {
    throw new AppError(404, "PROVIDER_NOT_FOUND", `没有名为 ${id} 的生成服务。`, {
      hint: "可用的服务列表见 GET /api/v1/config 的 providers 字段。",
    });
  }
  if (!adapter.summary.configured) {
    throw new AppError(403, "PROVIDER_DISABLED", `${adapter.summary.name} 尚未在站点启用。`, {
      hint: "部署者需要在环境变量中配置该提供商后才能使用。",
    });
  }
  return adapter;
}
