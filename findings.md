# Findings

## RunningHub endpoints

- Workflow JSON: `POST /api/openapi/getJsonApiFormat` with `{ apiKey, workflowId }`.
- AI App schema: `GET /api/webapp/apiCallDemo?apiKey=…&webappId=…`.
- Submit AI App: `POST /task/openapi/ai-app/run` with `{ apiKey, webappId, nodeInfoList }`.
- Poll: `POST /openapi/v2/query` with `Authorization: Bearer <key>` and `{ taskId }`.
- Cancel: `POST /task/openapi/cancel` with `{ apiKey, taskId }`.
- Upload (v2): `POST /openapi/v2/media/upload/binary`.

## Schema facts

- `apiCallDemo` returns `nodeInfoList[]` with `nodeId`, `nodeName`, `fieldName`,
  `fieldValue`, `fieldData`, `fieldType`, `description`, `descriptionEn`.
- `fieldData` may be a JSON string containing options or type metadata.
- `ai-app/run` can return `promptTips` containing ComfyUI node validation errors.
- Task status values include `QUEUED`, `RUNNING`, `SUCCESS`, `FAILED`.
- Numeric IDs can be 19 digits; JSON must serialize `webappId` as an exact number.

## Credential state

- The supplied 26-character key was rejected by `aiapp/list`, `apiCallDemo`, and
  `getJsonApiFormat` with user-not-found errors.
- The workflow JSON could not be retrieved. `scripts/fetch-workflow.mjs` retries the
  export once a valid key is available.
- No server-side key storage: schema caching by app ID was removed because it could
  bypass validation of a later visitor's key.

## Design research

- `ui-ux-pro-max` recommends AI-native surfaces, explicit generation state,
  low-cost motion and visible focus; combined with the approved deep charcoal and
  warm amber analog-studio direction.
- Typography: Playfair Display for display, Inter for UI, JetBrains Mono for
  parameter identifiers, with Songti/PingFang fallbacks for Chinese.
- Accessibility: 4.5:1 text contrast, visible focus, 44px targets, inline errors,
  `aria-live` status, skip link, native audio controls, reduced-motion support.
- Next.js guidance: keep interactive UI in a client leaf, expose server data via
  Edge route handlers, and use public env prefixes only for client-visible values.

## Verification notes

- Unit tests cover field parsing, type mapping, schema normalization, typed node
  construction, redaction, error mapping, exact app ID serialization, task outputs,
  cancel behavior, API CORS and request limits.
- Playwright mocks the full connection → dynamic form → generation → audio flow and
  checks 375px layout through the mobile project.
## Next.js 16 compatibility

- The bundled Route Handlers guide confirms `route.ts` uses Web `Request`/`Response`, supports `OPTIONS`, and is uncached by default.
- The bundled runtime reference marks `runtime = "edge"` deprecated in Next.js 16 and recommends the default Node.js runtime.
- The approved project plan explicitly requires Edge routes; implementation retains Edge and records the build warning as a deliberate compatibility tradeoff.
- Server-only page chrome was split from the client studio component so `/docs` does not ship the interactive studio bundle.

## Deployment observations

- Vercel CLI is logged out.
- Anonymous `vercel deploy --temporary` builds locally and fails on Windows while creating `.vercel/output` symlinks with `EPERM`, including archive mode.
- A production deploy should be run after `vercel login`; the CLI can then use its normal remote build path and project environment variables.

## Provider adapter notes

- Replicate: `POST https://api.replicate.com/v1/predictions` with `Authorization: Bearer <token>`; body is `{version, input}` when the model spec carries a `:version`, otherwise `{model, input}`. Prediction `status` maps starting→QUEUED, processing→RUNNING, succeeded→SUCCESS, failed→FAILED, canceled→CANCELLED. Results come back as an array/`output` that must be filtered to http(s) URLs.
- fal.ai: `POST https://queue.fal.run/<model>` with `Authorization: Key <key>` and the input object as the raw body; returns `request_id`. Status is `GET .../requests/{id}/status` (IN_QUEUE/IN_PROGRESS/COMPLETED/ERROR); the result payload is a separate `GET .../requests/{id}` and needs a bounded recursive scan for `{url,...}` objects, with contentType hinting the output type.
- OpenAI-compatible audio: `POST {base}/v1/audio/speech` with `response_format: "mp3"`; the response is binary audio, so it is wrapped as a `data:audio/mpeg;base64,…` URI and the job is reported `SUCCESS` immediately. It is a synchronous call, so long clips can exceed a Netlify function's time limit — the async providers are the safer choice there.
- Registry gating: `getProvider` returns null for unknown or unconfigured ids; `requireProvider` distinguishes 404 `PROVIDER_NOT_FOUND` (unknown) from 403 `PROVIDER_DISABLED` (known but not configured in the deployment).

## Playwright gotcha

- The provider radio inputs are visually hidden (`position: absolute; opacity: 0; pointer-events: none`) and the surrounding `.provider-card` label is the click surface. `getByRole("radio").check()` fails with "label intercepts pointer events"; click `label.provider-card` (filtered by provider name) instead and assert the `.selected` class.

## Netlify production notes

- Production URL: `https://melody-studio-rh-20261019.netlify.app`
- Netlify project visibility is public; `sso_login` is false.
- Netlify Credit Free teams created after July 28, 2026 default new projects to Private. Public sharing requires Project configuration > General > Visitor access > Project visibility > Public.
- Netlify CLI deploys by project ID when name lookup fails.
