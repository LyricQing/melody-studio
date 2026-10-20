import { preflightResponse, jsonResponse, errorResponse } from "@/lib/http";
import { listProviders } from "@/lib/providers/registry";
import { API_VERSION, MAX_UPLOAD_BYTES, SITE_NAME } from "@/lib/site";

export async function GET() {
  try {
    const providers = listProviders().filter((provider) => provider.configured);
    return jsonResponse({
      version: API_VERSION,
      siteName: SITE_NAME,
      configured: providers.length > 0,
      providers,
      maxUploadBytes: MAX_UPLOAD_BYTES,
      endpoints: {
        config: "/api/v1/config",
        schema: "/api/v1/schema",
        generate: "/api/v1/generate",
        job: "/api/v1/jobs/{taskId}",
        cancel: "/api/v1/jobs/{taskId}/cancel",
        uploads: "/api/v1/uploads",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export function OPTIONS() {
  return preflightResponse();
}
