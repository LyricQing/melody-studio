import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { replicateProvider } from "@/lib/providers/replicate";

type FetchImplementation = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const originalModel = process.env.REPLICATE_MODEL;

beforeEach(() => {
  process.env.REPLICATE_MODEL = "owner/name";
});

afterEach(() => {
  if (originalModel === undefined) delete process.env.REPLICATE_MODEL;
  else process.env.REPLICATE_MODEL = originalModel;
  vi.unstubAllGlobals();
});

describe("Replicate adapter", () => {
  it("exposes a fixed Chinese schema and configured flag", async () => {
    const schema = await replicateProvider.getSchema("token");
    expect(replicateProvider.summary.configured).toBe(true);
    expect(schema.providerId).toBe("replicate");
    expect(schema.fields.map((field) => field.key)).toContain("prompt");
  });

  it("submits a prediction with a mapped input and bearer auth", async () => {
    const fetchMock = vi.fn<FetchImplementation>(async () =>
      jsonResponse({ id: "pred-1", status: "starting" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const job = await replicateProvider.generate("token", { prompt: "夏夜", duration: 30 });
    expect(job).toMatchObject({ providerId: "replicate", taskId: "pred-1", status: "QUEUED" });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://api.replicate.com/v1/predictions");
    expect((init?.headers as Record<string, string>).authorization).toBe("Bearer token");
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body.model).toBe("owner/name");
    expect(body.input).toEqual({ prompt: "夏夜", duration: 30 });
  });

  it("uses the version field when the model ref pins a version", async () => {
    process.env.REPLICATE_MODEL = "owner/name:abc123";
    const fetchMock = vi.fn<FetchImplementation>(async () =>
      jsonResponse({ id: "pred-2", status: "starting" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await replicateProvider.generate("token", { prompt: "x" });
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
    expect(body.version).toBe("abc123");
    expect(body.model).toBeUndefined();
  });

  it("maps a succeeded prediction with audio outputs", async () => {
    const fetchMock = vi.fn<FetchImplementation>(async () =>
      jsonResponse({
        id: "pred-3",
        status: "succeeded",
        output: ["https://cdn.test/song.mp3", "https://cdn.test/cover.png"],
        metrics: { predict_time: 12 },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const job = await replicateProvider.getJob("token", "pred-3");
    expect(job.status).toBe("SUCCESS");
    expect(job.outputs).toEqual([
      { url: "https://cdn.test/song.mp3", type: "mp3" },
      { url: "https://cdn.test/cover.png", type: "png" },
    ]);
    expect(job.usage?.durationSeconds).toBe(12);
  });

  it("surfaces prediction failure messages", async () => {
    vi.stubGlobal("fetch", vi.fn<FetchImplementation>(async () =>
      jsonResponse({ id: "pred-4", status: "failed", error: "CUDA out of memory" }),
    ));
    const job = await replicateProvider.getJob("token", "pred-4");
    expect(job.status).toBe("FAILED");
    expect(job.error?.message).toBe("CUDA out of memory");
  });

  it("treats cancel of a finished prediction as a no-op", async () => {
    vi.stubGlobal("fetch", vi.fn<FetchImplementation>(async () =>
      jsonResponse({ detail: "prediction is already done" }, 409),
    ));
    await expect(replicateProvider.cancel("token", "pred-5")).resolves.toBe(false);
  });

  it("maps an invalid token to INVALID_KEY", async () => {
    vi.stubGlobal("fetch", vi.fn<FetchImplementation>(async () =>
      jsonResponse({ detail: "Unauthorized" }, 401),
    ));
    await expect(replicateProvider.getJob("bad", "pred-6")).rejects.toMatchObject({
      status: 401,
      code: "INVALID_KEY",
    });
  });
});
