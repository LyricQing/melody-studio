import { AppError } from "@/lib/errors";
import { errorResponse, getApiKey, jsonResponse, preflightResponse } from "@/lib/http";
import { requireProvider, resolveProviderId } from "@/lib/providers/registry";
import { MAX_UPLOAD_BYTES } from "@/lib/site";

const ALLOWED_EXTENSION = /\.(mp3|wav|flac|m4a|aac|ogg|opus|webm|png|jpe?g|webp|gif)$/i;

export async function POST(request: Request) {
  try {
    const apiKey = getApiKey(request);
    const provider = requireProvider(resolveProviderId(request));
    if (!provider.upload) {
      throw new AppError(415, "UNSUPPORTED_PROVIDER", "当前生成服务不支持上传参考文件。");
    }

    const contentType = request.headers.get("content-type") ?? "";

    if (!contentType.toLowerCase().includes("multipart/form-data")) {
      throw new AppError(415, "INVALID_CONTENT_TYPE", "上传请求必须使用 multipart/form-data。");
    }

    const declaredLength = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(declaredLength) && declaredLength > MAX_UPLOAD_BYTES + 128 * 1024) {
      throw new AppError(413, "FILE_TOO_LARGE", "上传文件不能超过 4MB。");
    }

    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      throw new AppError(400, "MISSING_FILE", "请选择一个文件再上传。");
    }
    if (file.size === 0) {
      throw new AppError(400, "EMPTY_FILE", "上传的文件是空的。");
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new AppError(413, "FILE_TOO_LARGE", "上传文件不能超过 4MB。");
    }

    const mime = (file.type || "").toLowerCase();
    const allowedMime =
      mime.startsWith("audio/") ||
      mime.startsWith("image/") ||
      mime === "application/octet-stream";
    if (!allowedMime && !ALLOWED_EXTENSION.test(file.name)) {
      throw new AppError(415, "UNSUPPORTED_FILE", "只支持音频或图片文件。");
    }

    const upload = await provider.upload(apiKey, file);
    return jsonResponse(upload, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export function OPTIONS() {
  return preflightResponse();
}
