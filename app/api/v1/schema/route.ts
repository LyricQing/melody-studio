import { errorResponse, getApiKey, jsonResponse, preflightResponse } from "@/lib/http";
import { requireProvider, resolveProviderId } from "@/lib/providers/registry";

export async function GET(request: Request) {
  try {
    const apiKey = getApiKey(request);
    const provider = requireProvider(resolveProviderId(request));
    const schema = await provider.getSchema(apiKey);
    return jsonResponse(schema);
  } catch (error) {
    return errorResponse(error);
  }
}

export function OPTIONS() {
  return preflightResponse();
}
