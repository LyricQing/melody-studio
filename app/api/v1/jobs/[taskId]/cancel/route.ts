import { AppError } from "@/lib/errors";
import { errorResponse, getApiKey, jsonResponse, preflightResponse } from "@/lib/http";
import { requireProvider, resolveProviderId } from "@/lib/providers/registry";

const TASK_ID_PATTERN = /^[A-Za-z0-9_-]{1,96}$/;

export async function POST(
  request: Request,
  context: { params: Promise<{ taskId: string }> },
) {
  try {
    const apiKey = getApiKey(request);
    const { taskId: raw } = await context.params;
    let taskId = raw.trim();
    try {
      taskId = decodeURIComponent(raw).trim();
    } catch {
      throw new AppError(400, "INVALID_TASK_ID", "任务 ID 格式不正确。");
    }

    if (!TASK_ID_PATTERN.test(taskId)) {
      throw new AppError(400, "INVALID_TASK_ID", "任务 ID 格式不正确。");
    }

    const provider = requireProvider(resolveProviderId(request));
    const cancelled = await provider.cancel(apiKey, taskId);
    return jsonResponse({ taskId, cancelled, providerId: provider.summary.id });
  } catch (error) {
    return errorResponse(error);
  }
}

export function OPTIONS() {
  return preflightResponse();
}
