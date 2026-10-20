export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly hint?: string;
  readonly upstreamCode?: number | string;

  constructor(
    status: number,
    code: string,
    message: string,
    options: { hint?: string; upstreamCode?: number | string; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.hint = options.hint;
    this.upstreamCode = options.upstreamCode;
  }
}

export function redact(input: string): string {
  return input
    .replace(/(apiKey=)[^&\s"']+/gi, "$1[redacted]")
    .replace(
      /(["']?authorization["']?\s*[:=]\s*["']?(?:bearer\s+)?)[^\s"',}]+/gi,
      "$1[redacted]",
    )
    .replace(/\b[0-9a-f]{24,}\b/gi, "[redacted]");
}

export function toApiError(error: unknown): {
  status: number;
  body: { error: { code: string; message: string; hint?: string } };
} {
  if (error instanceof AppError) {
    return {
      status: error.status,
      body: {
        error: {
          code: error.code,
          message: redact(error.message),
          ...(error.hint ? { hint: redact(error.hint) } : {}),
        },
      },
    };
  }

  const message =
    error instanceof Error ? redact(error.message) : "服务器暂时无法完成请求。";

  return {
    status: 500,
    body: {
      error: {
        code: "INTERNAL_ERROR",
        message: "服务器开小差了，请稍后重试。",
        hint: message.slice(0, 180),
      },
    },
  };
}

