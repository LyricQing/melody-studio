import type { Metadata } from "next";
import { AppFooter, AppHeader } from "@/components/site-chrome";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "API 文档",
  description:
    "Melody Studio v1 HTTP API：多提供商音乐生成，读取字段、提交生成、查询任务、取消与上传。",
};

const schemaExample = `curl "https://your-site.example/api/v1/schema?provider=runninghub" \\
  -H 'x-rh-key: YOUR_RUNNINGHUB_KEY'`;

const generateExample = `curl -X POST https://your-site.example/api/v1/generate \\
  -H 'content-type: application/json' \\
  -H 'x-rh-key: YOUR_RUNNINGHUB_KEY' \\
  -d '{"values":{"12:text":"温暖的木吉他民谣，关于夏夜和旧车站"}}'`;

const generateFixedExample = `curl -X POST https://your-site.example/api/v1/generate \\
  -H 'content-type: application/json' \\
  -H 'x-rh-key: YOUR_REPLICATE_TOKEN' \\
  -d '{"providerId":"replicate","values":{"prompt":"温暖的木吉他民谣","lyrics":"...","duration":30}}'`;

const pollExample = `curl "https://your-site.example/api/v1/jobs/TASK_ID?provider=replicate" \\
  -H 'x-rh-key: YOUR_REPLICATE_TOKEN'`;

const uploadExample = `curl -X POST "https://your-site.example/api/v1/uploads?provider=runninghub" \\
  -H 'x-rh-key: YOUR_RUNNINGHUB_KEY' \\
  -F 'file=@reference.wav'`;

const jobViewJson = `{
  "providerId": "replicate",
  "taskId": "abc123",
  "status": "QUEUED",
  "outputs": [],
  "error": null,
  "usage": null
}`;

const errorJson = `{
  "error": {
    "code": "INVALID_KEY",
    "message": "API Key 无效或已失效。",
    "hint": "请重新复制完整 Key。"
  }
}`;

function CodeBlock({ title, children }: { title: string; children: string }) {
  return (
    <figure className="code-block">
      <figcaption>{title}</figcaption>
      <pre><code>{children}</code></pre>
    </figure>
  );
}

export default function DocsPage() {
  return (
    <div className="site-shell">
      <a className="skip-link" href="#docs-main">跳到文档正文</a>
      <AppHeader siteName={SITE_NAME} docs />

      <main className="page-wrap" id="docs-main">
        <header className="docs-hero">
          <span className="eyebrow"><span className="eyebrow-dot" aria-hidden="true" />HTTP API · v1</span>
          <h1>把工作室接进你的产品。</h1>
          <p>
            版本化 HTTP API 代理多个音乐生成服务：RunningHub 动态 AI 应用、Replicate、fal.ai
            与 OpenAI 兼容音频接口。每个请求都使用调用者自己的 API Key，不依赖 Cookie、账号或服务端会话。
          </p>
        </header>

        <div className="docs-layout">
          <nav className="docs-nav" aria-label="文档目录">
            <a href="#overview">概览</a>
            <a href="#providers">提供商</a>
            <a href="#schema">读取字段</a>
            <a href="#generate">提交生成</a>
            <a href="#jobs">查询与取消</a>
            <a href="#uploads">上传文件</a>
            <a href="#errors">错误码</a>
            <a href="#security">密钥安全</a>
          </nav>

          <div className="docs-content">
            <section className="doc-section" id="overview">
              <h2>概览</h2>
              <p>
                所有接口位于同一站点下，请求必须携带 <code className="inline-code">x-rh-key</code>，
                也可以用 <code className="inline-code">Authorization: Bearer &lt;key&gt;</code>。
                API 路由运行在 Node.js Runtime，并开放无 Cookie 的 CORS，因此适合浏览器前端、
                Serverless 函数和自动化脚本直接调用。
              </p>
              <p>
                未指定提供商时默认使用 RunningHub。也可以通过 URL 查询参数
                <code className="inline-code">?provider=&lt;id&gt;</code>、请求头
                <code className="inline-code">x-provider-id</code> 或请求体字段
                <code className="inline-code">providerId</code> 指定。优先级为
                请求体 &gt; 请求头 &gt; 查询参数 &gt; 默认。
              </p>
              <table className="api-table">
                <thead><tr><th>方法</th><th>路径</th><th>作用</th></tr></thead>
                <tbody>
                  <tr><td>GET</td><td><code>/api/v1/config</code></td><td>站点公开配置与已启用提供商列表</td></tr>
                  <tr><td>GET</td><td><code>/api/v1/schema</code></td><td>读取指定提供商的表单字段</td></tr>
                  <tr><td>POST</td><td><code>/api/v1/generate</code></td><td>提交生成任务</td></tr>
                  <tr><td>GET</td><td><code>/api/v1/jobs/:taskId</code></td><td>查询状态和产物</td></tr>
                  <tr><td>POST</td><td><code>/api/v1/jobs/:taskId/cancel</code></td><td>取消任务</td></tr>
                  <tr><td>POST</td><td><code>/api/v1/uploads</code></td><td>上传参考音频或图片（仅支持的提供商）</td></tr>
                </tbody>
              </table>
              <p>
                <code className="inline-code">GET /api/v1/config</code> 返回 <code className="inline-code">providers</code> 数组，
                每项包含 <code className="inline-code">id</code>、<code className="inline-code">name</code>、
                <code className="inline-code">keyLabel</code>、<code className="inline-code">docsUrl</code> 与能力位
                （<code className="inline-code">dynamicSchema</code>、<code className="inline-code">uploads</code>、
                <code className="inline-code">cancellation</code>、<code className="inline-code">directOutput</code>）。
                站点只为已在部署环境配置的提供商开放访问。
              </p>
            </section>

            <section className="doc-section" id="providers">
              <h2>提供商</h2>
              <p>
                提供商由部署者通过环境变量配置，访客只提供自己的 Key。部署到 Netlify 时，
                在 Site configuration → Environment variables 中设置后重新部署即可。
              </p>
              <table className="api-table">
                <thead><tr><th>提供商</th><th>id</th><th>必填变量</th><th>可选变量</th></tr></thead>
                <tbody>
                  <tr>
                    <td>RunningHub</td><td><code>runninghub</code></td>
                    <td><code>RUNNINGHUB_WEBAPP_ID</code></td>
                    <td><code>RUNNINGHUB_BASE_URL</code></td>
                  </tr>
                  <tr>
                    <td>Replicate</td><td><code>replicate</code></td>
                    <td><code>REPLICATE_MODEL</code>（如 <code>owner/name:version</code>）</td>
                    <td><code>REPLICATE_INPUT_MAP</code>（JSON，逻辑字段→API 字段映射）</td>
                  </tr>
                  <tr>
                    <td>fal.ai</td><td><code>fal</code></td>
                    <td><code>FAL_MODEL</code>（如 <code>fal-ai/stable-audio</code>）</td>
                    <td><code>FAL_INPUT_MAP</code>（JSON 映射）</td>
                  </tr>
                  <tr>
                    <td>OpenAI 兼容音频</td><td><code>openai-audio</code></td>
                    <td><code>OPENAI_AUDIO_BASE_URL</code></td>
                    <td><code>OPENAI_AUDIO_MODEL</code>（默认 <code>gpt-4o-mini-tts</code>）、<code>OPENAI_AUDIO_INPUT_MAP</code></td>
                  </tr>
                </tbody>
              </table>
              <p>
                固定字段提供商（Replicate、fal.ai、OpenAI 兼容）使用统一的中文参数集：
                <code className="inline-code">prompt</code>、<code className="inline-code">lyrics</code>、
                <code className="inline-code">style</code>、<code className="inline-code">duration</code>、
                <code className="inline-code">instrumental</code>，OpenAI 兼容另有
                <code className="inline-code">voice</code>。默认到上游 API 字段的映射可通过
                <code className="inline-code">*_INPUT_MAP</code> 环境变量按模型需要覆盖。
              </p>
              <p>
                注意：OpenAI 兼容音频是同步接口，音频在提交请求内直接返回（data URI 形式）。
                Netlify 函数有默认执行时限，较长音频可能超时；这类部署更适合异步的 RunningHub、
                Replicate 或 fal.ai。
              </p>
            </section>

            <section className="doc-section" id="schema">
              <h2>读取字段</h2>
              <p>
                RunningHub 返回发布应用时勾选的动态输入节点，字段身份固定为
                <code className="inline-code">nodeId:fieldName</code>；固定字段提供商返回以逻辑键命名的字段。
                把 <code className="inline-code">key</code> 作为生成请求的对象键即可。
              </p>
              <CodeBlock title="GET /api/v1/schema">{schemaExample}</CodeBlock>
              <p>字段类型包括 <code className="inline-code">text</code>、<code className="inline-code">textarea</code>、<code className="inline-code">number</code>、<code className="inline-code">select</code>、<code className="inline-code">boolean</code>、<code className="inline-code">file</code> 和 <code className="inline-code">unknown</code>。响应包含 <code className="inline-code">providerId</code> 与 <code className="inline-code">providerName</code>，后续请求应以它为准。</p>
            </section>

            <section className="doc-section" id="generate">
              <h2>提交生成</h2>
              <p>
                请求体限制 64KB。服务端会根据 schema 校验字段、数字、下拉选项和文本长度，
                然后调用对应提供商的 API。
              </p>
              <CodeBlock title="POST /api/v1/generate · RunningHub">{generateExample}</CodeBlock>
              <CodeBlock title="POST /api/v1/generate · 固定字段提供商">{generateFixedExample}</CodeBlock>
              <p>
                成功时返回 <code className="inline-code">202</code> 和完整任务视图：
              </p>
              <CodeBlock title="202 响应">{jobViewJson}</CodeBlock>
              <p>
                大多数提供商返回 <code className="inline-code">QUEUED</code> 或 <code className="inline-code">RUNNING</code>，需要轮询；
                OpenAI 兼容音频直接返回 <code className="inline-code">SUCCESS</code>，
                <code className="inline-code">outputs</code> 中是可播放的 data URI 音频。
              </p>
            </section>

            <section className="doc-section" id="jobs">
              <h2>查询与取消</h2>
              <p>建议每 3 秒查询一次，直到状态进入终态。不要用轮询替代上游自己的任务生命周期。</p>
              <CodeBlock title="GET /api/v1/jobs/:taskId">{pollExample}</CodeBlock>
              <p>任务状态为 <code className="inline-code">QUEUED</code>、<code className="inline-code">RUNNING</code>、<code className="inline-code">SUCCESS</code>、<code className="inline-code">FAILED</code> 或 <code className="inline-code">CANCELLED</code>。成功响应中的 <code className="inline-code">outputs</code> 是带 <code className="inline-code">url</code> 与 <code className="inline-code">type</code> 的数组。</p>
              <p>
                取消：<code className="inline-code">POST /api/v1/jobs/:taskId/cancel</code>，返回
                <code className="inline-code">{`{"taskId":"...","cancelled":true}`}</code>。
                若任务已经结束，<code className="inline-code">cancelled</code> 可能为
                <code className="inline-code">false</code>。不支持取消的提供商（OpenAI 兼容音频）
                恒定返回 <code className="inline-code">false</code>。
              </p>
            </section>

            <section className="doc-section" id="uploads">
              <h2>上传文件</h2>
              <p>
                参考音频或图片通过 <code className="inline-code">multipart/form-data</code> 上传，
                单个文件最大 4MB。返回的 <code className="inline-code">fileName</code> 可以放进对应文件字段的
                values。目前仅 RunningHub 支持上传；其他提供商对 <code className="inline-code">/uploads</code>
                返回 <code className="inline-code">415 UNSUPPORTED_PROVIDER</code>。
              </p>
              <CodeBlock title="POST /api/v1/uploads">{uploadExample}</CodeBlock>
            </section>

            <section className="doc-section" id="errors">
              <h2>错误码</h2>
              <p>所有错误都使用统一 JSON 结构，并对 Key 和长十六进制串做脱敏。</p>
              <CodeBlock title="错误响应">{errorJson}</CodeBlock>
              <table className="api-table error-table">
                <thead><tr><th>HTTP</th><th>含义</th><th>建议处理</th></tr></thead>
                <tbody>
                  <tr><td>400</td><td>请求体或字段不合法</td><td>修正 values 或字段长度</td></tr>
                  <tr><td>401</td><td>Key 无效、缺失或失效</td><td>重新连接并复制完整 Key</td></tr>
                  <tr><td>402</td><td>提供商账户余额不足</td><td>充值或换一个有额度的 Key</td></tr>
                  <tr><td>403</td><td><code>PROVIDER_DISABLED</code>：提供商存在但未启用</td><td>部署者需先配置该提供商</td></tr>
                  <tr><td>404</td><td><code>PROVIDER_NOT_FOUND</code> 或上游模型/任务不存在</td><td>检查 provider 标识与配置</td></tr>
                  <tr><td>409</td><td>应用不可用或没有可调节点</td><td>检查发布状态与应用 ID</td></tr>
                  <tr><td>413</td><td>请求体或文件过大</td><td>缩短参数、时长或缩小文件</td></tr>
                  <tr><td>415</td><td><code>UNSUPPORTED_PROVIDER</code>：该提供商不支持上传</td><td>改用支持上传的提供商</td></tr>
                  <tr><td>422</td><td>上游参数校验失败</td><td>检查提示词、歌词与模型参数</td></tr>
                  <tr><td>429</td><td>上游队列已满或限流</td><td>稍后重试，减少并发</td></tr>
                  <tr><td>502</td><td>上游返回异常</td><td>保留错误信息并重试</td></tr>
                  <tr><td>504</td><td>连接上游超时</td><td>稍后重试；长任务不受影响</td></tr>
                </tbody>
              </table>
            </section>

            <section className="doc-section" id="security">
              <h2>密钥安全</h2>
              <ul>
                <li>站点没有账号、数据库或生成历史；Key 不写入仓库、Cookie 或 localStorage。</li>
                <li>网页默认只在内存中使用 Key；只有用户主动勾选时，才写入当前标签页的 sessionStorage（按提供商分开存储）。</li>
                <li>服务端只在代理请求期间转发 Key，不记录完整 URL，也不把 Key 拼进可分享链接。</li>
                <li>提供商的 Base URL 全部来自部署配置，访客无法让站点请求任意地址。</li>
                <li>CORS 只对无 Cookie 的 <code className="inline-code">/api/v1/*</code> 开放；不要把这个站点当成隐藏 Key 的保险箱。</li>
                <li>如果 Key 曾经出现在聊天、截图或公开日志中，请立刻到对应提供商控制台轮换。</li>
              </ul>
            </section>
          </div>
        </div>
      </main>

      <AppFooter siteName={SITE_NAME} />
    </div>
  );
}
