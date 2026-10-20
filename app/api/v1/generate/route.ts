import { AppError } from "@/lib/errors";
import {
  errorResponse,
  getApiKey,
  jsonResponse,
  preflightResponse,
  readJsonBody,
} from "@/lib/http";
import { requireProvider, resolveProviderId } from "@/lib/providers/registry";
import type { GenerateRequest, JobView } from "@/lib/types";

const MAX_VALUES = 100;

export async function POST(request: Request) {
  try {
    const apiKey = getApiKey(request);
    const body = await readJsonBody<GenerateRequest>(request);

    if (
      !body ||
      typeof body !== "object" ||
      !body.values ||
      typeof body.values !== "object" ||
      Array.isArray(body.values)
    ) {
      throw new AppError(400, "INVALID_BODY", "请求体必须包含 values 对象。");
    }

    const keys = Object.keys(body.values);
    if (keys.length > MAX_VALUES) {
      throw new AppError(400, "TOO_MANY_FIELDS", "一次提交的参数太多了。");
    }

    const provider = requireProvider(resolveProviderId(request, body.providerId));
    const job: JobView = await provider.generate(apiKey, body.values);

    return jsonResponse(job, { status: 202 });
  } catch (error) {
    return errorResponse(error);
  }
}

export function OPTIONS() {
  return preflightResponse();
}
