import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getConfig } from "@/app/api/v1/config/route";
import { OPTIONS as schemaOptions } from "@/app/api/v1/schema/route";
import { OPTIONS as generateOptions, POST as generate } from "@/app/api/v1/generate/route";
import { GET as getJob } from "@/app/api/v1/jobs/[taskId]/route";

const originalAppId = process.env.RUNNINGHUB_WEBAPP_ID;
const originalModel = process.env.REPLICATE_MODEL;
type FetchImplementation = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  process.env.RUNNINGHUB_WEBAPP_ID = "1877265245566922800";
  process.env.RUNNINGHUB_BASE_URL = "https://www.runninghub.cn";
  delete process.env.REPLICATE_MODEL;
});

afterEach(() => {
  if (originalAppId === undefined) delete process.env.RUNNINGHUB_WEBAPP_ID;
  else process.env.RUNNINGHUB_WEBAPP_ID = originalAppId;
  if (originalModel === undefined) delete process.env.REPLICATE_MODEL;
  else process.env.REPLICATE_MODEL = originalModel;
  vi.unstubAllGlobals();
});

describe("versioned API routes", () => {
  it("answers CORS preflight without a key or cookie", async () => {
    const response = generateOptions();
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-allow-headers")).toContain("x-rh-key");
    expect(schemaOptions().status).toBe(204);
  });

  it("lists the enabled providers in the public config", async () => {
    const response = await getConfig();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.configured).toBe(true);
    expect(body.providers.map((provider: { id: string }) => provider.id)).toEqual(["runninghub"]);
    expect(body.providers[0].keyLabel).toBe("RunningHub API Key");
  });

  it("runs schema then submission through the proxy", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        code: 0,
        data: {
          webappName: "Song Factory",
          nodeInfoList: [{
            nodeId: "12",
            nodeName: "Prompt",
            fieldName: "text",
            fieldType: "STRING",
            description: "提示词",
            fieldValue: "",
          }],
        },
      }))
      .mockResolvedValueOnce(jsonResponse({
        code: 0,
        data: { taskId: "task-777", taskStatus: "QUEUED" },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const request = new Request("http://localhost/api/v1/generate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-rh-key": "valid-key",
      },
      body: JSON.stringify({ values: { "12:text": "夏夜与旧车站" } }),
    });
    const response = await generate(request);
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      providerId: "runninghub",
      taskId: "task-777",
      status: "QUEUED",
      outputs: [],
      error: null,
    });
  });

  it("dispatches to a non-default provider and rejects an unknown one", async () => {
    process.env.REPLICATE_MODEL = "owner/name";
    const fetchMock = vi.fn<FetchImplementation>(async () => jsonResponse({ id: "pred-9", status: "starting" }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await generate(new Request("http://localhost/api/v1/generate", {
      method: "POST",
      headers: { "content-type": "application/json", "x-rh-key": "replicate-token" },
      body: JSON.stringify({ providerId: "replicate", values: { prompt: "夏夜" } }),
    }));
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({ providerId: "replicate", taskId: "pred-9" });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("api.replicate.com");

    const unknown = await generate(new Request("http://localhost/api/v1/generate", {
      method: "POST",
      headers: { "content-type": "application/json", "x-rh-key": "replicate-token" },
      body: JSON.stringify({ providerId: "ghost", values: { prompt: "x" } }),
    }));
    expect(unknown.status).toBe(404);
    expect((await unknown.json()).error.code).toBe("PROVIDER_NOT_FOUND");
  });

  it("rejects missing keys without calling upstream", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const request = new Request("http://localhost/api/v1/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ values: { "12:text": "test" } }),
    });
    const response = await generate(request);
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe("MISSING_KEY");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 400 for a malformed task ID", async () => {
    const response = await getJob(
      new Request("http://localhost/api/v1/jobs/%", {
        headers: { "x-rh-key": "valid-key" },
      }),
      { params: Promise.resolve({ taskId: "%" }) },
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("INVALID_TASK_ID");
  });

  it("rejects oversized request bodies before upstream access", async () => {
    const request = new Request("http://localhost/api/v1/generate", {
      method: "POST",
      headers: { "content-type": "application/json", "x-rh-key": "valid-key" },
      body: JSON.stringify({ values: { "12:text": "x".repeat(70 * 1024) } }),
    });
    const response = await generate(request);
    expect(response.status).toBe(413);
  });
});
