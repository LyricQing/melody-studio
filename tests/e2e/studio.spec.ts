import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const runningHubProvider = {
  id: "runninghub",
  name: "RunningHub",
  kind: "runninghub",
  description: "运行动态 AI 应用工作流，可调字段由已发布的应用决定",
  configured: true,
  keyLabel: "RunningHub API Key",
  docsUrl: "https://www.runninghub.cn/enterprise-api/sharedApi",
  capabilities: { dynamicSchema: true, uploads: true, cancellation: true, directOutput: false },
};

const replicateProvider = {
  id: "replicate",
  name: "Replicate",
  kind: "replicate",
  description: "通过 Replicate 运行社区与官方音乐生成模型",
  configured: true,
  keyLabel: "Replicate API Token",
  docsUrl: "https://replicate.com/docs/reference/http",
  modelLabel: "owner/name",
  capabilities: { dynamicSchema: false, uploads: false, cancellation: false, directOutput: false },
};

const runningHubSchema = {
  appId: "1877265245566922800",
  appName: "Song Factory",
  providerId: "runninghub",
  providerName: "RunningHub",
  fields: [
    {
      key: "12:text",
      nodeId: "12",
      fieldName: "text",
      nodeName: "Prompt",
      label: "提示词",
      help: "描述你想听到的声音",
      type: "textarea",
      defaultValue: "",
      group: "primary",
    },
    {
      key: "19:style",
      nodeId: "19",
      fieldName: "style",
      nodeName: "Style",
      label: "曲风",
      type: "select",
      defaultValue: "folk",
      options: [
        { value: "folk", label: "民谣" },
        { value: "jazz", label: "爵士" },
      ],
      group: "primary",
    },
    {
      key: "21:instrumental",
      nodeId: "21",
      fieldName: "instrumental",
      nodeName: "Instrumental",
      label: "纯音乐",
      type: "boolean",
      defaultValue: false,
      group: "advanced",
    },
  ],
};

const replicateSchema = {
  appId: "replicate",
  appName: "Replicate · owner/name",
  providerId: "replicate",
  providerName: "Replicate",
  fields: [
    {
      key: "prompt",
      nodeId: "provider",
      fieldName: "prompt",
      nodeName: "Prompt",
      label: "音乐描述",
      help: "描述风格、情绪、乐器、人声和场景",
      type: "textarea",
      defaultValue: "温暖清澈的独立民谣，木吉他，轻柔女声",
      group: "primary",
    },
    {
      key: "duration",
      nodeId: "provider",
      fieldName: "duration",
      nodeName: "Duration",
      label: "时长（秒）",
      type: "number",
      defaultValue: 30,
      group: "primary",
    },
    {
      key: "instrumental",
      nodeId: "provider",
      fieldName: "instrumental",
      nodeName: "Instrumental",
      label: "纯音乐",
      type: "boolean",
      defaultValue: false,
      group: "advanced",
    },
  ],
};

async function mockConfig(page: Page, providers = [runningHubProvider]) {
  await page.route(/\/api\/v1\/config(?:\?.*)?$/, (route) => route.fulfill({
    json: {
      version: "v1",
      configured: providers.length > 0,
      providers,
      maxUploadBytes: 4 * 1024 * 1024,
      siteName: "Melody Studio",
    },
  }));
}

test("connects, renders dynamic fields and produces a playable result", async ({ page }) => {
  await mockConfig(page);
  await page.route(/\/api\/v1\/schema(?:\?.*)?$/, (route) => route.fulfill({ json: runningHubSchema }));

  let submitted: unknown = null;
  await page.route(/\/api\/v1\/generate(?:\?.*)?$/, async (route) => {
    submitted = route.request().postDataJSON();
    await route.fulfill({
      status: 202,
      json: { providerId: "runninghub", taskId: "task-900", status: "QUEUED", outputs: [], error: null },
    });
  });
  let pollCount = 0;
  await page.route(/\/api\/v1\/jobs\/task-900(?:\?.*)?$/, (route) => {
    pollCount += 1;
    if (pollCount === 1) {
      return route.fulfill({
        json: { providerId: "runninghub", taskId: "task-900", status: "RUNNING", outputs: [], error: null },
      });
    }
    return route.fulfill({
      json: {
        providerId: "runninghub",
        taskId: "task-900",
        status: "SUCCESS",
        outputs: [{ url: "https://cdn.test/summer-station.mp3", type: "mp3" }],
        error: null,
        usage: { cost: "0.08", durationSeconds: 31 },
      },
    });
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "接入你的 API Key" })).toBeVisible();
  await expect(page.getByRole("radiogroup", { name: "选择生成服务" })).toHaveCount(0);

  await expect(page.getByRole("button", { name: /连接 RunningHub/ })).toBeEnabled();
  await page.getByLabel(/RunningHub API Key/).fill("valid-key-123456");
  await page.getByRole("button", { name: /连接 RunningHub/ }).click();

  await expect(page.getByText(/已连接 · Song Factory/)).toBeVisible();
  await page.getByLabel(/提示词/).fill("温暖的木吉他民谣，关于夏夜和旧车站");
  await page.getByLabel(/曲风/).selectOption("jazz");
  await page.locator("summary").filter({ hasText: "高级参数" }).click();
  await page.getByLabel(/纯音乐/).check();

  await page.getByRole("button", { name: "开始生成" }).click();
  await expect(page.getByText("RUNNING", { exact: true })).toBeVisible();
  await expect(page.getByText("你的作品已经就绪")).toBeVisible();
  await expect(page.locator("audio")).toHaveAttribute("src", "https://cdn.test/summer-station.mp3");
  await expect(page.getByRole("link", { name: /下载 summer-station\.mp3/ })).toBeVisible();

  expect(submitted).toEqual({
    providerId: "runninghub",
    values: {
      "12:text": "温暖的木吉他民谣，关于夏夜和旧车站",
      "19:style": "jazz",
      "21:instrumental": true,
    },
  });

  const storage = await page.evaluate(() => ({
    local: { ...localStorage },
    session: { ...sessionStorage },
    url: location.href,
  }));
  expect(JSON.stringify(storage.local)).not.toContain("valid-key-123456");
  expect(storage.url).not.toContain("valid-key-123456");
});

test("switches providers and plays an instantly finished result", async ({ page }) => {
  await mockConfig(page, [runningHubProvider, replicateProvider]);
  await page.route(/\/api\/v1\/schema(?:\?.*)?$/, (route) => {
    const url = new URL(route.request().url());
    const json = url.searchParams.get("provider") === "replicate" ? replicateSchema : runningHubSchema;
    return route.fulfill({ json });
  });

  let submitted: unknown = null;
  await page.route(/\/api\/v1\/generate(?:\?.*)?$/, async (route) => {
    submitted = route.request().postDataJSON();
    await route.fulfill({
      status: 202,
      json: {
        providerId: "replicate",
        taskId: "pred-1",
        status: "SUCCESS",
        outputs: [{ url: "data:audio/mpeg;base64,AAAA", type: "mp3" }],
        error: null,
      },
    });
  });

  await page.goto("/");
  await expect(page.getByRole("radiogroup", { name: "选择生成服务" })).toBeVisible();

  // The radio input is visually hidden; the card label is the click surface.
  await page.locator("label.provider-card").filter({ hasText: "Replicate" }).click();
  await expect(page.locator("label.provider-card.selected")).toContainText("Replicate");
  await expect(page.getByRole("button", { name: /连接 Replicate/ })).toBeEnabled();
  await page.getByLabel(/Replicate API Token/).fill("replicate-token-123");
  await page.getByRole("button", { name: /连接 Replicate/ }).click();

  await expect(page.getByText(/已连接 · Replicate · owner\/name/)).toBeVisible();
  await page.getByLabel(/音乐描述/).fill("夜晚的海边，合成器与鼓点");
  await page.getByRole("button", { name: "开始生成" }).click();

  // Instant providers skip polling and render the result straight from generate.
  await expect(page.getByText("你的作品已经就绪")).toBeVisible();
  await expect(page.locator("audio")).toHaveAttribute("src", "data:audio/mpeg;base64,AAAA");

  expect(submitted).toEqual({
    providerId: "replicate",
    values: {
      prompt: "夜晚的海边，合成器与鼓点",
      duration: 30,
      instrumental: false,
    },
  });
});

test("shows a recoverable message for an invalid key", async ({ page }) => {
  await mockConfig(page);
  await page.route(/\/api\/v1\/schema(?:\?.*)?$/, (route) => route.fulfill({
    status: 401,
    json: {
      error: {
        code: "INVALID_KEY",
        message: "API Key 无效或已失效。",
        hint: "请重新复制完整 Key。",
      },
    },
  }));

  await page.goto("/");
  await page.getByLabel(/RunningHub API Key/).fill("invalid-key-123");
  await page.getByRole("button", { name: /连接 RunningHub/ }).click();
  const formAlert = page.getByRole("region", { name: "音乐生成工作台" }).getByRole("alert");
  await expect(formAlert).toContainText("API Key 无效");
  await expect(formAlert).toContainText("请重新复制完整 Key");
});

test("keeps the connection screen inside the viewport and starts with a skip link", async ({ page }) => {
  await mockConfig(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "接入你的 API Key" })).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "跳到生成表单" })).toBeFocused();
});
