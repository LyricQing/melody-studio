# Melody Studio — RunningHub 音乐工作流公共网站

## Goal

Build and verify a public Next.js music-generation studio that runs the RunningHub
workflow through an AI App, using each visitor's own RunningHub API key. Ship a
versioned HTTP API, an accessible responsive UI, tests, and deployment docs.

## Phases

| Phase | Status | Work |
| --- | --- | --- |
| 1. Scaffold | complete | Next.js 16, TypeScript, Tailwind v4, project config |
| 2. RunningHub layer | complete | Schema fetch, run, poll, cancel, upload, error mapping |
| 3. API routes | complete | `/api/v1/*`, CORS, validation, key redaction |
| 4. Studio UI | complete | Key gate, dynamic form, player, responsive studio design |
| 5. Docs and tests | complete | `/docs`, 19 unit/API tests, 6 desktop/mobile E2E tests, visual QA |
| 6. Deployment prep | complete | README, env setup, export script, error handling |
| 7. Public deployment | complete | Netlify production deploy and public verification |
| 8. Real RunningHub smoke | blocked | Key is valid; RunningHub API account has insufficient balance |
| 9. Multi-provider layer | complete | RunningHub, Replicate, fal.ai, OpenAI-compatible audio adapters |
| 10. Provider UI + translations | complete | Provider picker, generic key flow, Chinese field/status labels |
| 11. Multi-provider docs/tests/deploy | complete | API docs, adapter tests, updated E2E; production redeploy pending CLI auth |

## Production

- URL: https://melody-studio-rh-20261019.netlify.app
- Netlify project ID: `69b11357-5e06-4caa-9f75-f1afd2114a25`
- Public AI App ID: `2112120926325272578`
- Runtime environment: `RUNNINGHUB_WEBAPP_ID=2112120926325272578`

## Decisions

- BYO provider key only; no accounts, database, or server-side key storage.
- Providers are server-configured and allowlisted; visitors cannot supply arbitrary Base URLs.
- RunningHub remains the default; existing x-rh-key requests stay backward compatible.
- Runtime source of truth is the published AI App schema from `apiCallDemo`.
- API routes use the default Node.js Runtime for Netlify and current Next.js 16.
- Field identity is `nodeId:fieldName`.
- Visual direction: dark analog studio, amber accent, editorial display type.
- No cross-request schema cache: every connection validates the caller's Key.
- Key persistence is opt-in and limited to `sessionStorage`; no localStorage/Cookie.
- Netlify project visibility is Public; previews may remain Private.
- Workflow reference export is a script, not fabricated content.

## Verification

- `npm run typecheck` — passed
- `npm run lint` — passed with no warnings
- `npm test` — 8 files / 49 tests passed (RunningHub + 4 provider adapters + registry + API)
- `npm run build` — passed (9 routes, Node.js runtime)
- `npm run test:e2e` — 8 desktop/mobile Chromium tests passed (incl. provider switch + instant result)
- Local provider gating: `/api/v1/config` lists only configured providers; `?provider=replicate` → 403 `PROVIDER_DISABLED`; `?provider=ghost` → 404 `PROVIDER_NOT_FOUND`
- Homepage public HTTPS — 200
- `/docs` public HTTPS — 200
- `/api/v1/config` — 200, `configured: true`
- `/api/v1/schema` with invalid key — 401 `INVALID_KEY`
- `OPTIONS /api/v1/generate` — 204 with CORS `*`
- Client hydration check — “应用已配置” and connect button enabled
- Real RunningHub smoke test — key valid, upstream returned `INSUFFICIENT_BALANCE`; no task was created

## Errors Encountered

| Error | Attempt | Resolution |
| --- | --- | --- |
| CC Switch proxy HTTP 400: orphaned `apply_patch` tool call | 2 | Avoided `apply_patch`; wrote through PowerShell |
| Vercel signup phone rejected | 2 | Switched to Netlify rather than bypassing Vercel verification |
| Netlify website login did not authenticate CLI | 1 | Completed CLI ticket authorization in browser |
| Netlify deploy by project name returned Not Found | 1 | Deployed using project ID |
| Netlify CLI env:set initially used wrong context flags | 2 | Set variable for all contexts and verified production |
| Netlify new project defaulted Private | 2 | User changed Project visibility to Public |

## Remaining External Action

Recharge the RunningHub API account or switch to a Key with available shared-API balance, then rerun `test-results\smoke-request.json` through `POST /api/v1/generate`. The Key file is already valid and the workflow reference is exported.