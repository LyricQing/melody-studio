import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_PROVIDER_ID,
  getProvider,
  listProviders,
  requireProvider,
  resolveProviderId,
} from "@/lib/providers/registry";

const original = {
  REPLICATE_MODEL: process.env.REPLICATE_MODEL,
  FAL_MODEL: process.env.FAL_MODEL,
  OPENAI_AUDIO_BASE_URL: process.env.OPENAI_AUDIO_BASE_URL,
  RUNNINGHUB_WEBAPP_ID: process.env.RUNNINGHUB_WEBAPP_ID,
};

function restore(name: keyof typeof original): void {
  const value = original[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

beforeEach(() => {
  for (const name of Object.keys(original) as (keyof typeof original)[]) {
    delete process.env[name];
  }
});

afterEach(() => {
  for (const name of Object.keys(original) as (keyof typeof original)[]) {
    restore(name);
  }
});

describe("provider registry", () => {
  it("always lists all four providers with a live configured flag", () => {
    const providers = listProviders();
    expect(providers.map((provider) => provider.id).sort()).toEqual([
      "fal",
      "openai-audio",
      "replicate",
      "runninghub",
    ]);
    expect(providers.every((provider) => provider.configured === false)).toBe(true);
  });

  it("returns null for unconfigured providers and adapters when enabled", () => {
    expect(getProvider("replicate")).toBeNull();
    expect(getProvider("unknown")).toBeNull();

    process.env.REPLICATE_MODEL = "owner/name";
    expect(getProvider("replicate")?.summary.name).toBe("Replicate");
  });

  it("distinguishes unknown from disabled providers", () => {
    expect(() => requireProvider("nope")).toThrowError(/没有名为/);
    expect(() => requireProvider("fal")).toThrowError(/尚未在站点启用/);

    process.env.FAL_MODEL = "fal-ai/stable-audio";
    expect(requireProvider("fal").summary.id).toBe("fal");
  });

  it("resolves provider id by body > header > query > default", () => {
    const request = new Request("http://localhost/api/v1/generate?provider=fal", {
      headers: { "x-provider-id": "replicate" },
    });
    expect(resolveProviderId(request, "openai-audio")).toBe("openai-audio");
    expect(resolveProviderId(request)).toBe("replicate");

    const queryOnly = new Request("http://localhost/api/v1/generate?provider=fal");
    expect(resolveProviderId(queryOnly)).toBe("fal");
    expect(resolveProviderId(new Request("http://localhost/api/v1/generate"))).toBe(
      DEFAULT_PROVIDER_ID,
    );
  });
});
