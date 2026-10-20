import { afterEach, describe, expect, it } from "vitest";
import {
  applyInputMap,
  fixedSchema,
  parseEnvObject,
  parseInputMap,
  resolveStatus,
  validateFixedValues,
} from "@/lib/providers/shared";

const originalInputMap = process.env.TEST_PROVIDER_INPUT_MAP;

afterEach(() => {
  if (originalInputMap === undefined) delete process.env.TEST_PROVIDER_INPUT_MAP;
  else process.env.TEST_PROVIDER_INPUT_MAP = originalInputMap;
});

describe("fixed provider value validation", () => {
  it("accepts text, clamps rounding for duration and rejects empty input", () => {
    const result = validateFixedValues({
      prompt: " 夏夜 ",
      duration: 30.6,
      instrumental: 1,
    });
    expect(result).toEqual({ prompt: "夏夜", duration: 31, instrumental: true });
    expect(() => validateFixedValues({})).toThrowError(/至少填写/);
  });

  it("rejects out-of-range durations and oversized text", () => {
    expect(() => validateFixedValues({ prompt: "a", duration: 0 })).toThrowError(/时长/);
    expect(() => validateFixedValues({ prompt: "a", duration: 601 })).toThrowError(/时长/);
    expect(() => validateFixedValues({ prompt: "x".repeat(12001) })).toThrowError(/过长/);
  });
});

describe("input mapping", () => {
  it("merges the default map with env overrides", () => {
    process.env.TEST_PROVIDER_INPUT_MAP = JSON.stringify({ prompt: "custom_prompt" });
    const input = applyInputMap(
      { prompt: "hello", duration: 12 },
      { prompt: "prompt", duration: "duration" },
      "TEST_PROVIDER_INPUT_MAP",
    );
    expect(input).toEqual({ custom_prompt: "hello", duration: 12 });
  });

  it("ignores non-string map entries and malformed JSON throws", () => {
    process.env.TEST_PROVIDER_INPUT_MAP = JSON.stringify({ prompt: 12, ok: " yes " });
    expect(parseInputMap("TEST_PROVIDER_INPUT_MAP")).toEqual({ ok: "yes" });
    process.env.TEST_PROVIDER_INPUT_MAP = "{not json}";
    expect(() => parseEnvObject("TEST_PROVIDER_INPUT_MAP")).toThrowError(/合法 JSON/);
  });
});

describe("status normalization and fixed schema", () => {
  it("maps provider status vocabularies", () => {
    expect(resolveStatus("in_queue")).toBe("QUEUED");
    expect(resolveStatus("processing")).toBe("RUNNING");
    expect(resolveStatus("succeeded")).toBe("SUCCESS");
    expect(resolveStatus("error")).toBe("FAILED");
    expect(resolveStatus("canceled")).toBe("CANCELLED");
    expect(resolveStatus("mystery")).toBe("RUNNING");
  });

  it("builds a Chinese fixed schema with optional voice field", () => {
    const schema = fixedSchema("replicate", "Replicate", "owner/name");
    expect(schema.providerId).toBe("replicate");
    expect(schema.appName).toBe("Replicate · owner/name");
    expect(schema.fields.map((field) => field.key)).toEqual([
      "prompt",
      "lyrics",
      "style",
      "duration",
      "instrumental",
    ]);
    expect(schema.fields[0].label).toBe("音乐描述");

    const withVoice = fixedSchema("openai-audio", "OpenAI 兼容音频", "tts", { includeVoice: true });
    expect(withVoice.fields.some((field) => field.key === "voice")).toBe(true);
  });
});
