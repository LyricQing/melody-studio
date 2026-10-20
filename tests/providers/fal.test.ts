import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { falProvider } from "@/lib/providers/fal";

type FetchImplementation = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const originalModel = process.env.FAL_MODEL;

beforeEach(() => {
  process.env.FAL_MODEL = "fal-ai/stable-audio";
});

afterEach(() => {
  if (originalModel === undefined) delete process.env.FAL_MODEL;
  else process.env.FAL_MODEL = originalModel;
  vi.unstubAllGlobals();
});

describe("fal.ai adapter", () => {
  it("submits to the queue endpoint with a Key authorization header", async () => {
    const fetchMock = vi.fn<FetchImplementation>(async () =>
      jsonResponse({ request_id: "req-1", status: "IN_QUEUE" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const job = await falProvider.generate("fal-key", { prompt: "清晨", duration: 20 });
    expect(job).toMatchObject({ providerId: "fal", taskId: "req-1", status: "QUEUED" });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://queue.fal.run/fal-ai/stable-audio");
    expect((init?.headers as Record<string, string>).authorization).toBe("Key fal-key");
    expect(JSON.parse(String(init?.body))).toEqual({ prompt: "清晨", duration: 20 });
  });

  it("reports in-progress status without fetching results", async () => {
    const fetchMock = vi.fn<FetchImplementation>(async () => jsonResponse({ status: "IN_PROGRESS" }));
    vi.stubGlobal("fetch", fetchMock);

    const job = await falProvider.getJob("fal-key", "req-2");
    expect(job.status).toBe("RUNNING");
    expect(job.outputs).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/requests/req-2/status");
  });

  it("fetches and flattens nested audio outputs on completion", async () => {
    const fetchMock = vi.fn<FetchImplementation>()
      .mockResolvedValueOnce(jsonResponse({ status: "COMPLETED" }))
      .mockResolvedValueOnce(jsonResponse({
        audio: { url: "https://fal.test/song.mp3", content_type: "audio/mpeg" },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const job = await falProvider.getJob("fal-key", "req-3");
    expect(job.status).toBe("SUCCESS");
    expect(job.outputs).toEqual([{ url: "https://fal.test/song.mp3", type: "mp3" }]);
  });

  it("treats cancelling a finished request as a no-op", async () => {
    vi.stubGlobal("fetch", vi.fn<FetchImplementation>(async () =>
      jsonResponse({ detail: "request already finished" }, 409),
    ));
    await expect(falProvider.cancel("fal-key", "req-4")).resolves.toBe(false);
  });

  it("maps an invalid key to INVALID_KEY", async () => {
    vi.stubGlobal("fetch", vi.fn<FetchImplementation>(async () =>
      jsonResponse({ detail: "Unauthorized" }, 401),
    ));
    await expect(falProvider.generate("bad", { prompt: "x" })).rejects.toMatchObject({
      status: 401,
      code: "INVALID_KEY",
    });
  });
});
