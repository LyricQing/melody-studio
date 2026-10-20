#!/usr/bin/env node
import { readFile, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const workflowId =
  process.argv[2]?.trim() || process.env.RUNNINGHUB_WORKFLOW_ID?.trim() || "2110715799911616513";
const baseUrl =
  process.env.RUNNINGHUB_BASE_URL?.trim() || "https://www.runninghub.cn";
const keyFile =
  process.env.RUNNINGHUB_KEY_FILE?.trim() ||
  path.join(process.env.USERPROFILE || process.env.HOME || ".", ".config", "runninghub", "api_key.txt");

async function readKey() {
  if (process.env.RUNNINGHUB_API_KEY?.trim()) return process.env.RUNNINGHUB_API_KEY.trim();
  if (!existsSync(keyFile)) {
    throw new Error(
      `Missing API key. Set RUNNINGHUB_API_KEY or create ${keyFile} with the key on one line.`,
    );
  }
  return (await readFile(keyFile, "utf8")).trim();
}

function scrub(value) {
  if (typeof value === "string") {
    return value
      .replace(/(apiKey=)[^&\s"']+/gi, "$1[redacted]")
      .replace(/\b[0-9a-f]{24,}\b/gi, "[redacted]");
  }
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        /^api.?key$/i.test(key) ? "apiKey" : key,
        /^api.?key$/i.test(key) ? "[redacted]" : scrub(child),
      ]),
    );
  }
  return value;
}

async function main() {
  if (!/^\d{5,30}$/.test(workflowId)) {
    throw new Error("Workflow ID must be a numeric RunningHub workflow ID.");
  }
  const origin = new URL(baseUrl).origin;
  if (!["https://www.runninghub.cn", "https://runninghub.cn", "https://www.runninghub.ai", "https://runninghub.ai"].includes(origin)) {
    throw new Error("RUNNINGHUB_BASE_URL must be an official RunningHub origin.");
  }

  const apiKey = await readKey();
  const response = await fetch(`${origin}/api/openapi/getJsonApiFormat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ apiKey, workflowId }),
    signal: AbortSignal.timeout(60_000),
  });
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`RunningHub returned non-JSON HTTP ${response.status}: ${text.slice(0, 160)}`);
  }

  if (!response.ok || Number(payload.code ?? 0) !== 0) {
    const message = payload.msg ?? payload.message ?? `HTTP ${response.status}`;
    throw new Error(`RunningHub rejected the export: ${message}`);
  }

  const output = scrub({
    available: true,
    workflowId,
    fetchedAt: new Date().toISOString(),
    source: `${origin}/api/openapi/getJsonApiFormat`,
    response: payload,
  });

  const destination = path.resolve(process.cwd(), "docs", "workflow.reference.json");
  const temporary = `${destination}.tmp`;
  await writeFile(temporary, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  await rename(temporary, destination);
  console.log(`Saved workflow reference to ${destination}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});