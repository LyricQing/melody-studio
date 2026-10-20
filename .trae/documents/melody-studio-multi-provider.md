# Melody Studio 多提供商升级计划（Phase 9–11 收尾）

## Summary

接手 Codex 上未完成的 Melody Studio 项目（RunningHub 音乐生成工作室，Next.js 16）。Phase 1–8 已完成并部署在 Netlify；上次会话刚启动 Phase 9「多提供商层」，仅存在 `lib/providers/types.ts` 与 `lib/providers/shared.ts` 两个基础文件。本计划：

1. 将源项目复制到当前工作区（不含 node_modules 等构建产物），安装依赖并基线验证。
2. 完成 Phase 9–11：4 个提供商适配器 + 注册表、提供商感知 API、提供商选择 UI、文档与测试更新。
3. 全量验证（typecheck / lint / vitest / build / Playwright E2E）后重新部署到现有 Netlify 生产站点。

## Current State Analysis

### 源项目位置
`C:\Users\jeffery\OneDrive\文档\ChatGPT\音乐生成`（git 已初始化但无提交，全部文件未跟踪 → 直接复制工作树即可完整保留状态）。

### 已有实现（保持不动或小改）
- `lib/runninghub.ts`：RunningHub 上游客户端（schema/run/poll/cancel/upload + 错误映射），域名白名单校验。
- `lib/fields.ts`：RunningHub 节点 schema 归一化、`buildNodeInfoList`。
- `lib/http.ts`：CORS、`getApiKey`（`x-rh-key` / Bearer）、请求体限制。
- `lib/types.ts`：**已扩展**多提供商类型（`ProviderKind`、`ProviderSummary`、`ProviderCapabilities`、`AppSchema.providerId/providerName`、`JobView.providerId`、`GenerateRequest.providerId`）。
- `lib/providers/types.ts`：`ProviderAdapter` 接口（summary/getSchema/generate/getJob/cancel/upload?）。
- `lib/providers/shared.ts`：env 解析（`envValue`/`parseEnvObject`/`parseInputMap`）、`fixedSchema`（固定字段 prompt/lyrics/style/duration/instrumental/voice，中文标签）、`validateFixedValues`、`applyInputMap`、`resolveStatus`。
- API 路由（6 个）**仍是 RunningHub 专用**，未接入提供商分发。
- `components/studio.tsx`（约 950 行）：客户端 UI，硬编码 RunningHub 文案与 `x-rh-key`。
- 测试：19 项 Vitest + 6 项 Playwright E2E（mock 上游，无需真实 Key）。
- 部署：Netlify `melody-studio-rh-20261019`（项目 ID `69b11357-5e06-4caa-9f75-f1afd2114a25`），`RUNNINGHUB_WEBAPP_ID=2112120926325272578` 已配置。

### 既定决策（来自 task_plan.md，沿用不再更改）
- 仅 BYO Key：访客自带各提供商 Key，无账号/数据库/服务端存储。
- 提供商由**部署环境变量**配置并允许列表化；访客不能提供任意 Base URL。
- RunningHub 保持默认；`x-rh-key` 请求头向后兼容。
- 字段标识：RunningHub 用 `nodeId:fieldName`，固定提供商用逻辑键（prompt/lyrics/…）。
- API 路由用默认 Node.js Runtime。

## Proposed Changes

### 0. 迁移项目到当前工作区

- 复制 `C:\Users\jeffery\OneDrive\文档\ChatGPT\音乐生成\` → `c:\Users\jeffery\Documents\trae_projects\Melody Studio\`，
  **排除**：`node_modules`、`.next`、`.netlify`、`.vercel`、`playwright-report`、`test-results`、`tsconfig.tsbuildinfo`。
  **包含**：其余全部（含 `.git`、`.env.local`、`.env.example`、`AGENTS.md`、`task_plan.md`、`progress.md`、`findings.md`）。
- `npm install`，跑基线验证：`npm run typecheck && npm run lint && npm test && npm run build`。
- 期间更新 `task_plan.md`（Phase 9–11 状态）与 `progress.md`（记录本次会话）。

### 1. 提供商注册表与适配器（Phase 9 主体）

**新增 `lib/providers/registry.ts`**
- `listProviders(): ProviderSummary[]`：返回 4 个提供商的摘要（含 `configured`，读取各自 env 判断）。
- `getProvider(id): ProviderAdapter | null`：仅当该提供商已配置时返回适配器。
- `resolveProviderId(request: Request, bodyProviderId?: string): string`：优先级 body `providerId` > `x-provider-id` 头 > `?provider=` 查询参数 > 默认 `"runninghub"`；未知/未配置提供商抛 `AppError(404, "PROVIDER_NOT_FOUND")` 或 `403 PROVIDER_DISABLED`。

**新增 4 个适配器（均实现 `ProviderAdapter`）**

1. `lib/providers/runninghub.ts` — 包装现有 `lib/runninghub.ts` 函数；结果补 `providerId: "runninghub"`；capabilities：dynamicSchema=true, uploads=true, cancellation=true, directOutput=false。env：`RUNNINGHUB_WEBAPP_ID`。
2. `lib/providers/replicate.ts` — Replicate Predictions API（`https://api.replicate.com/v1`，Bearer 认证）。
   - env：`REPLICATE_MODEL`（必填，如 `lucasaspect/acely`）、`REPLICATE_INPUT_MAP`（可选 JSON，逻辑键→API 字段映射）。
   - generate：`POST /v1/predictions` `{ model?/version?, input }`，input 由 `applyInputMap` 生成；返回 `{ id, status:"starting" }` → JobView(QUEUED)。
   - getJob：`GET /v1/predictions/{id}`；状态映射 starting→QUEUED、processing→RUNNING、succeeded→SUCCESS、failed→FAILED、canceled→CANCELLED；output（string|string[]）过滤音频 URL 进 outputs。
   - cancel：`POST /v1/predictions/{id}/cancel`。
   - capabilities：uploads=false，其余 true。
3. `lib/providers/fal.ts` — fal.ai Queue API（`https://queue.fal.run`，`Authorization: Key <key>`）。
   - env：`FAL_MODEL`（必填）、`FAL_INPUT_MAP`（可选）。
   - generate：`POST https://queue.fal.run/{model}` → `{ request_id, status }` → JobView(QUEUED)。
   - getJob：先 `GET …/requests/{id}/status`（IN_QUEUE/IN_PROGRESS/COMPLETED），COMPLETED 时再 `GET …/requests/{id}` 取结果，递归扫描 payload 中的 audio URL（`audio.url` 等）。
   - cancel：`PUT …/requests/{id}/cancel`（HTTP 200/204 视为成功，409/404 视为已结束返回 false）。
   - capabilities：uploads=false，cancellation=true。
4. `lib/providers/openai-audio.ts` — OpenAI 兼容音频（同步接口，`POST {base}/v1/audio/speech`）。
   - env：`OPENAI_AUDIO_BASE_URL`（必填，部署方配置允许的域名）、`OPENAI_AUDIO_MODEL`（默认 `gpt-4o-mini-tts`）、`OPENAI_AUDIO_INPUT_MAP`（可选）。
   - generate：请求 `input`（默认取 lyrics，否则 prompt）、`voice`、`instructions`（style 拼入）、`response_format:"mp3"`；响应二进制 → base64 `data:` URI 作为 `OutputItem.url`（type `mp3`）；**同步完成**，直接返回 `JobView(status=SUCCESS, outputs, usage)`；taskId 用 `oa-<随机串>`。
   - getJob：合成已完成视图（`{ taskId, status:"SUCCESS", outputs:[] }`，客户端对 SUCCESS 不轮询、不显示重新查询，故可接受；文档注明即时提供商不支持重新查询）。
   - cancel：返回 false（cancellation=false）。
   - capabilities：dynamicSchema=false, uploads=false, cancellation=false, directOutput=true。
   - 生成请求超时设 120s（Netlify 函数默认 10s 上限是已知限制，写入文档）。

**Key 获取统一化（`lib/http.ts` 小改）**
- `getApiKey` 错误文案改为提供商中立（"API Key"，hint 保留 `x-rh-key` 说明），避免对 Replicate 等显示 "RunningHub API Key"。

### 2. 提供商感知 API（改 6 个路由）

| 路由 | 变更 |
| --- | --- |
| `app/api/v1/config/route.ts` | 增加 `providers: ProviderSummary[]`（仅含已配置的）；`configured` 改为任一提供商已配置；向后兼容字段保留 |
| `app/api/v1/schema/route.ts` | `resolveProviderId(request)` → `adapter.getSchema(key)` |
| `app/api/v1/generate/route.ts` | body `{ providerId?, values }`；分发 `adapter.generate(key, values)`；**响应改为完整 JobView**（含 taskId/status/outputs/error/usage/providerId，是旧 `{taskId,status}` 的超集，202 不变） |
| `app/api/v1/jobs/[taskId]/route.ts` | `?provider=` / `x-provider-id` 分发 `adapter.getJob` |
| `app/api/v1/jobs/[taskId]/cancel/route.ts` | 同上分发 `adapter.cancel` |
| `app/api/v1/uploads/route.ts` | 分发 `adapter.upload`；提供商无 uploads 能力时返回 `415 UNSUPPORTED_PROVIDER` |

RunningHub generate 响应从 `{taskId,status}` 升级为 JobView：runninghub 适配器的 generate 内部先 `buildNodeInfoList` + `runApp`，再补 `outputs:[]、error:null、providerId`。

### 3. Studio UI 提供商选择（Phase 10）

改 `components/studio.tsx` + `lib/site.ts`：

- `PublicConfig` 增加 `providers: ProviderSummary[]`。
- **连接表单**：在 Key 输入框上方加提供商选择（radio 卡片，每个显示 name/description/keyLabel；仅一个提供商时不显示选择器）。选中状态存 `selectedProviderId`（默认第一个，即 RunningHub）。
- **Key 状态按提供商隔离**：`activeKey` 与 `keyInput` 跟随所选提供商；sessionStorage 键改为按提供商：`melody.key.<providerId>`（`site.ts` 中 `KEY_STORAGE_NAME` 常量改为 `keyStorageName(providerId)` 函数；旧常量删除，sessionStorage 本就随标签页会话失效，无需迁移）。
- 连接：`GET /api/v1/schema?provider=<id>`，头仍 `x-rh-key`；连接成功后文案显示 `已连接 · {schema.appName}`（已通用）。
- 生成：body 带 `providerId: schema.providerId`；响应按完整 JobView 处理——若 `TERMINAL_STATUSES.has(created.status)`（即时提供商）则直接 `setJob(created)` 不轮询，否则照旧轮询。
- 轮询/取消/重查：URL 加 `?provider=<schema.providerId>`。
- **能力感知**：由 `config.providers` 查当前提供商 capabilities——`cancellation=false` 隐藏「取消任务」；`uploads=false` 不渲染 file 字段（固定 schema 本无 file 字段，双保险）；即时提供商在 job 卡片不显示「重新查询」。
- 文案去硬编码：「连接 RunningHub」→「连接 {provider.name}」；「正在轮询 RunningHub」→「正在轮询 {provider.name}」；hero/步骤中 RunningHub 字样改为通用「API Key / 服务商」表述（保留 RunningHub 作为默认示例的说明）。
- 中文状态标签已有（statusLabel 覆盖全部 JobStatus），无需改动；`fixedSchema` 字段标签已是中文。

### 4. 文档更新（Phase 11）

- `app/docs/page.tsx`：接口表加 `provider` 参数与 `providers` 配置响应；新增「提供商配置」小节（各提供商 env 变量表 + Netlify 设置说明）；curl 示例补一个 `providerId` 示例；注明 OpenAI 兼容为同步接口及其在 Netlify 的超时限制。
- `README.md`：环境变量表补 `REPLICATE_MODEL`、`REPLICATE_INPUT_MAP`、`FAL_MODEL`、`FAL_INPUT_MAP`、`OPENAI_AUDIO_BASE_URL`、`OPENAI_AUDIO_MODEL`、`OPENAI_AUDIO_INPUT_MAP`；「提供商」章节；标题从 RunningHub 专用改为多提供商描述。
- `.env.example`：补上述可选变量（注释默认注释掉）。
- `task_plan.md`：Phase 9–11 状态更新为 complete；`progress.md` / `findings.md` 记录本次会话结论。

### 5. 测试

- 新增 `tests/providers/shared.test.ts`：`validateFixedValues` 边界（时长 1–600、空输入 400、超长 400）、`applyInputMap` 默认映射+env 覆盖、`resolveStatus` 全状态、`parseEnvObject` 非法 JSON 503。
- 新增 `tests/providers/registry.test.ts`：未配置提供商返回 null；`resolveProviderId` 优先级与 404。
- 新增 `tests/providers/replicate.test.ts`、`fal.test.ts`、`openai-audio.test.ts`：vi.stubGlobal("fetch") mock 上游，覆盖提交/轮询状态映射/取消/错误映射（401/402/超时）与（openai）data URI 输出。
- 更新 `tests/api.test.ts`：config 列出 providers；generate 带 `providerId` 分发到固定提供商（mock fetch）；未知 providerId 404。
- 更新 `tests/e2e/studio.spec.ts`：mock `/api/v1/config` 返回 `providers` 列表；保持现有桌面/移动 6 项流程通过；新增 1 项「切换到 Replicate 提供商 → 连接 → 生成（即时成功）→ 播放」流程。

## Assumptions & Decisions

1. **工作位置**：复制到当前工作区开发（用户已确认），OneDrive 原目录保持只读不动。
2. **部署**：完成后 `npx netlify-cli deploy --build --prod --site 69b11357-5e06-4caa-9f75-f1afd2114a25`（用户已确认）；若 CLI 登录态失效需用户浏览器授权。新提供商 env 不配置也不影响现有 RunningHub 功能。
3. **任务跨提供商歧义**：通过 `?provider=` 参数显式指定，不做复合 taskId 编码（保持 taskId 与上游一致、可读）。
4. **generate 响应升级为完整 JobView**：旧客户端消费 `{taskId,status}` 字段仍兼容；新客户端借此支持即时提供商。
5. **OpenAI 兼容音频**：用 `/v1/audio/speech` 同步接口 + data URI 产物，不做服务端音频托管（符合「无存储」安全边界）；长音频受 Netlify 函数时限约束，文档明示。
6. Replicate/fal 的上传能力置 false（v1 无对应公开通用上传 API），RunningHub 独有。
7. 不引入新 npm 依赖；适配器直接用 `fetch`。

## Verification

按顺序执行，全部通过才算完成：

1. `npm run typecheck` — 0 错误
2. `npm run lint` — 0 警告
3. `npm test` — 全部 Vitest 通过（预计 30+ 项）
4. `npm run build` — 生产构建成功
5. `npx playwright install chromium`（首次）+ `npm run test:e2e` — 桌面/移动全部通过
6. 本地 `npm run dev` 冒烟：`GET /api/v1/config` 返回 providers；`GET /api/v1/schema?provider=replicate`（未配置时）返回 404 `PROVIDER_NOT_FOUND`；默认 RunningHub schema 正常
7. Netlify 部署后公网验证：主页 200、`/docs` 200、`/api/v1/config` 含 providers、`OPTIONS /api/v1/generate` 204 CORS、无效 Key 401
8. 更新 `task_plan.md` 勾掉 Phase 9–11，`progress.md` 记录结果

## 执行顺序

1. 复制项目 → npm install → 基线验证
2. registry + 4 适配器
3. 6 个 API 路由改造
4. Studio UI（选择器/多 Key/能力感知/文案）
5. 文档（docs 页、README、.env.example）
6. 测试编写与更新
7. 全量验证 → 修复
8. Netlify 部署 + 公网验证
9. 收尾：更新 task_plan/progress/findings
