import { AppError } from "@/lib/errors";
import { errorResponse, getApiKey, jsonResponse, preflightResponse } from "@/lib/http";
import { requireProvider, resolveProviderId } from "@/lib/providers/registry";

const TASK_ID_PATTERN = /^[A-Za-z0-9_-]{1,96}$/;

function taskIdFrom(value: string): string {
  let taskId = value.trim();
  try {
    taskId = decodeURIComponent(value).trim();
  } catch {
    throw new AppError(400, "INVALID_TASK_ID", "任务 ID 格式不正确。");
  }
  if (!TASK_ID_PATTERN.test(taskId)) {
    throw new AppError(400, "INVALID_TASK_ID", "任务 ID 格式不正确。");
  }
  return taskId;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ taskId: string }> },
) {
  try {
    const apiKey = getApiKey(request);
    const { taskId: raw } = await context.params;
    const taskId = taskIdFrom(raw);
    const provider = requireProvider(resolveProviderId(request));
    const job = await provider.getJob(apiKey, taskId);
    return jsonResponse(job);
  } catch (error) {
    return errorResponse(error);
  }
}

export function OPTIONS() {
  return preflightResponse();
}
