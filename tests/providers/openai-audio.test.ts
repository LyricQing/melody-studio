import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openaiAudioProvider } from "@/lib/providers/openai-audio";

type FetchImplementation = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const originalBase = process.env.OPENAI_AUDIO_BASE_URL;
const originalModel = process.env.OPENAI_AUDIO_MODEL;

beforeEach(() => {
  process.env.OPENAI_AUDIO_BASE_URL = "https://api.openai.com";
  delete process.env.OPENAI_AUDIO_MODEL;
});

afterEach(() => {
  if (originalBase === undefined) delete process.env.OPENAI_AUDIO_BASE_URL;
  else process.env.OPENAI_AUDIO_BASE_URL = originalBase;
  if (originalModel === undefined) delete process.env.OPENAI_AUDIO_MODEL;
  else process.env.OPENAI_AUDIO_MODEL = originalModel;
  vi.unstubAllGlobals();
});

describe("OpenAI-compatible audio adapter", () => {
  it("returns a fixed schema with a voice field and an instant capability set", async () => {
    const schema = await openaiAudioProvider.getSchema("key");
    expect(schema.providerId).toBe("openai-audio");
    expect(schema.fields.some((field) => field.key === "voice")).toBe(true);
    expect(openaiAudioProvider.summary.capabilities).toMatchObject({
      directOutput: true,
      cancellation: false,
      uploads: false,
    });
  });

  it("posts speech and returns a data URI already completed", async () => {
    const fetchMock = vi.fn<FetchImplementation>(async () =>
      new Response(new Uint8Array([1, 2, 3, 4]), {
        status: 200,
        headers: { "content-type": "audio/mpeg" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const job = await openaiAudioProvider.generate("sk-test", {
      lyrics: "月色正好",
      style: "温柔",
      voice: "alloy",
    });
    expect(job.status).toBe("SUCCESS");
    expect(job.outputs[0].url.startsWith("data:audio/mpeg;base64,")).toBe(true);
    expect(job.outputs[0].type).toBe("mp3");

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://api.openai.com/v1/audio/speech");
    expect((init?.headers as Record<string, string>).authorization).toBe("Bearer sk-test");
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body.model).toBe("gpt-4o-mini-tts");
    expect(body.input).toBe("月色正好");
    expect(body.instructions).toBe("温柔");
    expect(body.voice).toBe("alloy");
  });

  it("honours OPENAI_AUDIO_MODEL overrides", async () => {
    process.env.OPENAI_AUDIO_MODEL = "tts-1";
    const fetchMock = vi.fn<FetchImplementation>(async () =>
      new Response(new Uint8Array([9]), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await openaiAudioProvider.generate("sk-test", { prompt: "hello" });
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
    expect(body.model).toBe("tts-1");
  });

  it("maps an invalid key to INVALID_KEY and never polls a synthetic task", async () => {
    vi.stubGlobal("fetch", vi.fn<FetchImplementation>(async () =>
      jsonResponse({ error: { message: "Incorrect API key", code: "invalid_api_key" } }, 401),
    ));
    await expect(openaiAudioProvider.generate("bad", { prompt: "x" })).rejects.toMatchObject({
      status: 401,
      code: "INVALID_KEY",
    });

    const job = await openaiAudioProvider.getJob("bad", "oa-anything");
    expect(job.status).toBe("SUCCESS");
    expect(job.providerId).toBe("openai-audio");
  });

  it("refuses to cancel an instant job", async () => {
    await expect(openaiAudioProvider.cancel("key", "oa-1")).resolves.toBe(false);
  });
});
