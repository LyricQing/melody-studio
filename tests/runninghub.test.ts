import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelTask,
  fetchAppSchema,
  mapUpstreamError,
  queryTask,
  runApp,
  uploadMedia,
} from "@/lib/runninghub";

const originalAppId = process.env.RUNNINGHUB_WEBAPP_ID;
const originalBaseUrl = process.env.RUNNINGHUB_BASE_URL;
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
});

afterEach(() => {
  process.env.RUNNINGHUB_WEBAPP_ID = originalAppId;
  process.env.RUNNINGHUB_BASE_URL = originalBaseUrl;
  vi.unstubAllGlobals();
});

describe("RunningHub client", () => {
  it("reads and normalizes the published AI App schema", async () => {
    const fetchMock = vi.fn<FetchImplementation>(async () => jsonResponse({
      code: 0,
      data: {
        webappName: "Song Factory",
        nodeInfoList: [{
          nodeId: "12",
          nodeName: "Prompt",
          fieldName: "text",
          fieldType: "STRING",
          description: "提示词",
          fieldValue: "夜晚",
        }],
      },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const schema = await fetchAppSchema("valid-key");
    expect(schema.appId).toBe("1877265245566922800");
    expect(schema.appName).toBe("Song Factory");
    expect(schema.fields[0].key).toBe("12:text");
    expect(String(fetchMock.mock.calls[0][0])).toContain("apiCallDemo");
  });

  it("keeps the 19-digit webappId exact when submitting", async () => {
    const fetchMock = vi.fn<FetchImplementation>(async () => jsonResponse({
      code: 0,
      data: { taskId: "task-123", taskStatus: "QUEUED" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await runApp("valid-key", [
      { nodeId: "12", fieldName: "text", fieldValue: "夏夜" },
    ]);
    expect(result).toEqual({ taskId: "task-123", status: "QUEUED" });
    const init = fetchMock.mock.calls[0]?.[1];
    const body = String(init?.body);
    expect(body).toContain('"webappId":1877265245566922800');
    expect(body).toContain('"nodeId":"12"');
  });

  it("rejects ComfyUI node validation errors returned with a task ID", async () => {
    const fetchMock = vi.fn<FetchImplementation>(async () => jsonResponse({
      code: 0,
      data: {
        taskId: "task-invalid",
        promptTips: "{\"node_errors\":{\"12\":{\"errors\":[\"bad prompt\"]}}}",
      },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(runApp("valid-key", [
      { nodeId: "12", fieldName: "text", fieldValue: "test" },
    ])).rejects.toMatchObject({ status: 422, code: "NODE_VALIDATION" });
  });

  it("uploads media with bearer authentication", async () => {
    const fetchMock = vi.fn<FetchImplementation>(async () => jsonResponse({
      code: 0,
      data: { fileName: "runninghub/reference.wav" },
    }, 201));
    vi.stubGlobal("fetch", fetchMock);

    const file = new File([new Uint8Array([1, 2, 3])], "reference.wav", { type: "audio/wav" });
    const result = await uploadMedia("valid-key", file);
    expect(result).toEqual({ fileName: "runninghub/reference.wav", url: undefined });
    const init = fetchMock.mock.calls[0]?.[1];
    expect((init?.headers as Record<string, string>).authorization).toBe("Bearer valid-key");
    expect(init?.body).toBeInstanceOf(FormData);
  });
  it("returns typed outputs and task failure details", async () => {
    const fetchMock = vi.fn<FetchImplementation>(async () => jsonResponse({
      code: 0,
      data: {
        status: "FAILED",
        errorCode: "NODE_ERROR",
        errorMessage: "Sampler failed",
        results: [{ fileUrl: "https://cdn.test/song.mp3", outputType: "mp3" }],
        usage: { consumeMoney: "0.12", taskCostTime: 42 },
      },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const job = await queryTask("valid-key", "task-123");
    expect(job.status).toBe("FAILED");
    expect(job.outputs).toEqual([{ url: "https://cdn.test/song.mp3", type: "mp3" }]);
    expect(job.error?.message).toBe("Sampler failed");
    expect(job.usage).toEqual({ cost: "0.12", durationSeconds: 42 });
  });

  it("cancels a task and reports already-finished tasks", async () => {
    const fetchMock = vi.fn<FetchImplementation>()
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: {} }))
      .mockResolvedValueOnce(jsonResponse({ code: 99, msg: "task already finished" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(cancelTask("valid-key", "task-1")).resolves.toBe(true);
    await expect(cancelTask("valid-key", "task-1")).resolves.toBe(false);
  });

  it("maps upstream failure categories to API errors", () => {
    expect(mapUpstreamError({ code: 806, msg: "APIKEY_USER_NOT_FOUND" })).toMatchObject({ status: 401, code: "INVALID_KEY" });
    expect(mapUpstreamError({ code: 999, msg: "insufficient balance" })).toMatchObject({ status: 402 });
    expect(mapUpstreamError({ code: 814, msg: "queue full" })).toMatchObject({ status: 429 });
    expect(mapUpstreamError({ code: 500, msg: "boom" })).toMatchObject({ status: 502, code: "UPSTREAM_ERROR" });
  });

  it("rejects an app with no exposed nodes", async () => {
    vi.stubGlobal("fetch", vi.fn<FetchImplementation>(async () => jsonResponse({
      code: 0,
      data: { webappName: "Empty", nodeInfoList: [] },
    })));
    await expect(fetchAppSchema("valid-key")).rejects.toMatchObject({
      status: 409,
      code: "NO_NODES",
    });
  });
});