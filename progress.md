# Progress

## Session 1

- Read the `ui-ux-pro-max` and `planning-with-files` skill instructions.
- Verified RunningHub public endpoints and schema shape.
- Confirmed the supplied API key is invalid and the AI App is not yet available.
- Started project scaffolding.

## Session 2 — 2026-10-19

- Located and read the interrupted thread record and all recoverable messages/tool output.
- Verified the existing `lib/` implementation and resumed from the lost tool call at `lib/types.ts`.
- Added `/api/v1/config`, `schema`, `generate`, `jobs/[taskId]`, `cancel`, and `uploads` Edge routes.
- Added the dark analog studio UI with a Key gate, dynamic primary/advanced fields,
  file upload, polling, cancel, audio playback/download, accessible status and mobile layout.
- Made boolean fields, switches, skip links, focus handling and long identifiers accessible.
- Added `/docs` with curl examples, API/error tables and Key security guidance.
- Split shared chrome into a server component so `/docs` does not load the studio bundle.
- Added `scripts/fetch-workflow.mjs`, an honest unavailable-state workflow reference,
  and a deployment-focused README.
- Added 19 Vitest/API tests and 6 Playwright mocked E2E tests across desktop and mobile.
- Verified `typecheck`, lint with no warnings, unit tests, production build and E2E.
- Checked production screenshots at 1440px and 375px and corrected Chinese headline wrapping.
- Attempted anonymous Vercel deployment twice; local build fails creating Windows symlinks.
- Remaining external blockers: Vercel login, published `RUNNINGHUB_WEBAPP_ID`, valid RunningHub Key.
## Session 3 — 2026-10-19

- Received published AI App ID `2112120926325272578`.
- Wrote it to ignored `.env.local`.
- Verified local `/api/v1/config` reports `configured: true`.
- Verified an invalid Key returns 401 `INVALID_KEY` through the real local Edge route.
- Vercel CLI remains logged out; production deployment still needs browser authorization.

## Netlify deployment — 2026-10-19

- Netlify CLI authorization completed for the user account.
- Created project `melody-studio-rh-20261019`.
- Project ID: `69b11357-5e06-4caa-9f75-f1afd2114a25`.
- Set `RUNNINGHUB_WEBAPP_ID=2112120926325272578` for all contexts.
- Removed deprecated Edge runtime exports and added Netlify Next.js Runtime 5.16.2.
- Production deployment completed successfully at `https://melody-studio-rh-20261019.netlify.app`.
- Netlify Credit Free teams now create projects private by default. The current site still requires team login until its project visibility is changed to Public.
- CLI/API ignored attempts to set the team SSO fields; documented UI path is Project configuration > General > Visitor access > Project visibility.

## Public verification — 2026-10-19

- User set Netlify project visibility to Public; site API confirmed `sso_login: false`.
- Public homepage returns 200 with title `Melody Studio — RunningHub 音乐生成工作室`.
- Public `/docs` returns 200 with title `API 文档 · Melody Studio`.
- Public config endpoint returns 200 with `configured: true`.
- Invalid-key schema request returns 401 with `INVALID_KEY`.
- Public CORS preflight returns 204 with `access-control-allow-origin: *`.
- Browser hydration confirmed badge `应用已配置`, connect button enabled, no console errors.
- Remaining optional validation: one real short generation using a valid local RunningHub Key.

## Real smoke attempt — 2026-10-19

- User reported key was placed, but `C:\Users\jeffery\.config\runninghub\api_key.txt` exists with length 0.
- `npm run fetch:workflow` therefore reached RunningHub with an empty value and returned `user not exist`.
- Production schema request returned `MISSING_KEY`.
- Waiting for the user to paste the actual RunningHub Key into the file and save it.

## Valid-key smoke attempt — 2026-10-19

- Key file now contains a 32-character key with no whitespace.
- `npm run fetch:workflow` succeeded and replaced the placeholder with the real workflow reference.
- Live schema returned 17 fields for AI App `2112120926325272578`.
- Found and fixed LIST/COMBO option parsing for primitive string arrays; redeployed with 20 tests passing.
- Live schema now exposes 145 VAE options, 194 CLIP options, 163 samplers, 51 languages, etc.
- Prepared a 30-second request with a four-line Chinese lyric and default model parameters.
- RunningHub rejected submission before task creation with HTTP 402 `INSUFFICIENT_BALANCE`.
- No generation task was created and no documented charge was incurred for the rejected submission.

## Multi-provider upgrade — started 2026-10-19

- User approved the recommended provider set: RunningHub, Replicate, fal.ai, OpenAI-compatible audio.
- Scope: provider registry and adapters, provider-aware API, provider picker, per-provider BYO keys, Chinese field/status translations, docs and tests.
- Security decision: provider Base URLs come from deployment configuration, never arbitrary visitor input.

## Multi-provider implementation — 2026-10-20

- Migrated the project from OneDrive into this workspace (robocopy, excluding build artifacts; kept `.git` and `.env.local`), then installed dependencies.
- Built `lib/providers/`: `types.ts`, `shared.ts` (env parsing, fixed schema, fixed-value validation, input mapping, status mapping, upstream JSON fetch, task-id helper), `registry.ts` (dispatch + resolution + gating), and four adapters.
- Adapters: `runninghub.ts` (wraps the existing client, dynamic schema), `replicate.ts` (Predictions API), `fal.ts` (Queue API, two-step status+result), `openai-audio.ts` (synchronous `/v1/audio/speech` returning a data URI).
- Made all six `/api/v1/*` routes provider-aware via `resolveProviderId` (body > `x-provider-id` > `?provider=` > default) and `requireProvider` (404 unknown / 403 unconfigured).
- Extended `lib/fields.ts` schema normalization and `JobView`/`AppSchema` with `providerId`/`providerName`; replaced `KEY_STORAGE_NAME` with per-provider `keyStorageName()`.
- Rebuilt the Studio UI: provider picker (`role="radiogroup"`), per-provider key label/docs link and sessionStorage key, provider-scoped schema/poll/cancel/refresh URLs, and capability-driven buttons (hide cancel / hide re-query for direct-output providers).
- Updated `/docs` (`#providers` section with env tables), `README.md`, `.env.example`, `layout.tsx` metadata and the site chrome.
- Tests: added `tests/providers/{shared,registry,replicate,fal,openai-audio}.test.ts`, rewrote `tests/api.test.ts` for provider dispatch, and extended `tests/e2e/studio.spec.ts` with a provider-switch + instant-result flow.
- Verified: `typecheck` clean, `lint` clean, `npm test` 8 files / 49 tests, `npm run build` 9 routes, `npm run test:e2e` 8 desktop/mobile tests.
- Local smoke: `/api/v1/config` lists only RunningHub (the only configured provider); `?provider=replicate` → 403 `PROVIDER_DISABLED`; `?provider=ghost` → 404 `PROVIDER_NOT_FOUND`.
- Blocked: Netlify CLI is not authenticated in this workspace (no stored config, no `NETLIFY_AUTH_TOKEN`); awaiting `npx netlify-cli login` before the production redeploy.

## Production deployment + placeholder providers — 2026-10-20

- User ran `npx netlify-cli login`; confirmed via `npx netlify-cli status` (junhao zhou / LyricQing's team).
- First production deploy (49 tests green, build 9 routes) succeeded at `6ad7324ebf03...`.
- Netlify env vars for extra providers were set as `All` scope, `all` context: `REPLICATE_MODEL=owner/name`, `FAL_MODEL=fal-ai/stable-audio`, `OPENAI_AUDIO_BASE_URL=https://api.openai.com`.
- Three redeploys after env:set were initially confusing — the production domain kept returning only RunningHub. Diagnosed by adding a temporary `_debug` field and `console.log`; the unique deploy URL confirmed env injection worked and all 4 providers were configured.
- Root cause: Netlify's edge CDN cached the old `/api/v1/config` response for a short window. Subsequent requests with `Cache-Control: no-cache` and the unique deploy URL confirmed correctness.
- Cleaned up debug code, final deploy `6ad737dd08ca...` verified in production:
  - `GET /api/v1/config` — 4 providers (runninghub, replicate, fal, openai-audio), each with correct capability flags
  - `GET /api/v1/schema?provider=replicate` — 200, 5 fixed Chinese fields
  - `GET /api/v1/schema?provider=openai-audio` — 200, 6 fields (incl. voice)
  - `GET /api/v1/schema?provider=ghost` — 404 `PROVIDER_NOT_FOUND`
- Provider picker automatically renders on the homepage (`providers.length > 1`).

## Real model configs — 2026-10-20

- Replaced placeholder env values with verified real models (schemas confirmed against official docs):
  - `REPLICATE_MODEL=meta/musicgen` + `REPLICATE_INPUT_MAP={"prompt":"prompt","duration":"duration"}` — MusicGen has no lyrics/style/instrumental inputs; the map drops them so upstream never 422s.
  - `FAL_MODEL=fal-ai/stable-audio` (kept) + `FAL_INPUT_MAP={"prompt":"prompt","duration":"seconds_total"}` — fal's stable-audio names its duration field `seconds_total`.
  - `OPENAI_AUDIO_BASE_URL=https://api.openai.com` + default `gpt-4o-mini-tts` kept — already a real, schema-compatible config.
- One transient deploy failure (`Failed retrieving extensions... fetch failed`); retry succeeded without changes.
- Production verified: config lists 4 providers; schemas report `Replicate · meta/musicgen`, `fal.ai · fal-ai/stable-audio`, `OpenAI 兼容音频 · gpt-4o-mini-tts`.
