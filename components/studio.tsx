"use client";

import Link from "next/link";

import {
  ArrowRight,
  ArrowSquareOut,
  Broadcast,
  CaretDown,
  CheckCircle,
  Copy,
  DownloadSimple,
  Eye,
  EyeSlash,
  Key,
  LockKey,
  MusicNotes,
  SlidersHorizontal,
  StopCircle,
  WarningCircle,
} from "@phosphor-icons/react";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppFooter, AppHeader } from "@/components/site-chrome";
import { initialValues, isAudioType } from "@/lib/fields";
import {
  ClientApiError,
  hintFromError,
  messageFromError,
  requestJson,
} from "@/lib/client-api";
import {
  GENERATION_TIMEOUT_MS,
  keyStorageName,
  POLL_INTERVAL_MS,
  WORKFLOW_URL,
} from "@/lib/site";
import type {
  AppSchema,
  Field,
  FieldValue,
  JobView,
  OutputItem,
  ProviderSummary,
  Values,
} from "@/lib/types";

interface StudioProps {
  siteName: string;
}

interface PublicConfig {
  version: string;
  configured: boolean;
  providers: ProviderSummary[];
  maxUploadBytes: number;
}

interface UploadResult {
  fileName: string;
  url?: string;
}

type FormError = { message: string; hint?: string } | null;

const TERMINAL_STATUSES = new Set(["SUCCESS", "FAILED", "CANCELLED", "TIMEOUT"]);

function formatSeconds(value: number): string {
  const minutes = Math.floor(value / 60).toString().padStart(2, "0");
  const seconds = (value % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function fieldInputId(field: Field): string {
  return `field-${field.key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function fieldHelpId(field: Field): string {
  return `${fieldInputId(field)}-help`;
}

function outputName(output: OutputItem, index: number): string {
  const clean = output.url.split("?")[0].split("#")[0];
  const name = clean.split("/").pop();
  return name && name.includes(".") ? name : `音乐产物 ${index + 1}`;
}

function statusLabel(job: JobView | null): string {
  if (!job) return "待生成";
  switch (job.status) {
    case "QUEUED": return "排队中";
    case "RUNNING": return "生成中";
    case "SUCCESS": return "已完成";
    case "FAILED": return "生成失败";
    case "CANCELLED": return "已取消";
    case "TIMEOUT": return "等待超时";
    default: return "处理中";
  }
}

function statusTone(job: JobView | null): string {
  if (!job) return "queued";
  return job.status.toLowerCase();
}

function WaveformBars() {
  const heights = [18, 30, 46, 24, 38, 52, 28, 44, 20, 34, 50, 26, 42, 16, 32, 48, 22, 40];
  return (
    <div className="wave-bars" aria-hidden="true">
      {heights.map((height, index) => (
        <span key={index} style={{ height }} />
      ))}
    </div>
  );
}

function FieldControl({
  field,
  value,
  file,
  onChange,
  onFile,
}: {
  field: Field;
  value: FieldValue | undefined;
  file?: File;
  onChange: (value: FieldValue) => void;
  onFile: (file: File) => void;
}) {
  const id = fieldInputId(field);
  const helpId = fieldHelpId(field);
  const describedBy = field.help ? helpId : undefined;

  if (field.type === "boolean") {
    return (
      <div className="field">
        <div className="field-label">
          {field.label}
          <span className="field-key">{field.key}</span>
        </div>
        <label className="toggle-row" htmlFor={id}>
          <span className="toggle-copy">
            <strong>{Boolean(value) ? "已开启" : "已关闭"}</strong>
            <span>{field.help || "切换这个工作流参数"}</span>
          </span>
          <span className="switch">
            <input
              id={id}
              type="checkbox"
              checked={Boolean(value)}
              onChange={(event) => onChange(event.target.checked)}
              aria-label={`${field.label}：${Boolean(value) ? "开启" : "关闭"}`}
              aria-describedby={describedBy}
            />
            <span className="switch-track" aria-hidden="true" />
          </span>
        </label>
      </div>
    );
  }

  if (field.type === "file") {
    return (
      <div className="field">
        <label className="field-label" htmlFor={id}>
          {field.label}
          <span className="field-key">{field.key}</span>
        </label>
        <label className="file-drop" htmlFor={id}>
          <input
            id={id}
            type="file"
            accept="audio/*,image/*,.mp3,.wav,.flac,.m4a,.aac,.ogg,.opus,.png,.jpg,.jpeg,.webp"
            onChange={(event) => {
              const next = event.target.files?.[0];
              if (next) onFile(next);
            }}
            aria-describedby={helpId}
          />
          <Broadcast size={25} weight="duotone" aria-hidden="true" />
          <strong>{file ? file.name : "选择参考音频或图片"}</strong>
          <span>{file ? "将在生成时安全上传" : "支持常见音频与图片，最大 4MB"}</span>
        </label>
        {field.help ? <p className="field-help" id={helpId}>{field.help}</p> : null}
      </div>
    );
  }

  if (field.type === "select") {
    return (
      <div className="field">
        <label className="field-label" htmlFor={id}>
          {field.label}
          <span className="field-key">{field.key}</span>
        </label>
        <select
          id={id}
          className="select"
          value={String(value ?? "")}
          onChange={(event) => onChange(event.target.value)}
          aria-describedby={describedBy}
        >
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        {field.help ? <p className="field-help" id={helpId}>{field.help}</p> : null}
      </div>
    );
  }

  if (field.type === "textarea") {
    return (
      <div className="field">
        <label className="field-label" htmlFor={id}>
          {field.label}
          <span className="field-key">{field.key}</span>
        </label>
        <textarea
          id={id}
          className="textarea"
          value={String(value ?? "")}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.help || "在这里写下你的想法…"}
          aria-describedby={describedBy}
        />
        {field.help ? <p className="field-help" id={helpId}>{field.help}</p> : null}
      </div>
    );
  }

  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {field.label}
        <span className="field-key">{field.key}</span>
      </label>
      <input
        id={id}
        className="input"
        type={field.type === "number" ? "number" : "text"}
        inputMode={field.type === "number" ? "decimal" : undefined}
        value={String(value ?? "")}
        onChange={(event) => {
          const next = event.target.value;
          onChange(field.type === "number" && next !== "" ? Number(next) : next);
        }}
        placeholder={field.help || (field.type === "number" ? "输入数字" : "填写参数")}
        aria-describedby={describedBy}
      />
      {field.help ? <p className="field-help" id={helpId}>{field.help}</p> : null}
    </div>
  );
}

function OutputCard({ output, index }: { output: OutputItem; index: number }) {
  const name = outputName(output, index);
  const audio = isAudioType(output.type, output.url);
  return (
    <article className="output-card">
      <div className="output-top">
        <div className="output-name">
          <MusicNotes size={19} weight="duotone" aria-hidden="true" />
          <span title={output.url}>{name}</span>
        </div>
        <a
          className="btn btn-secondary"
          href={output.url}
          target="_blank"
          rel="noreferrer"
          download={name}
          aria-label={`下载 ${name}`}
          style={{ minHeight: 40, paddingInline: 14 }}
        >
          <DownloadSimple size={17} aria-hidden="true" />
          下载
        </a>
      </div>
      {audio ? (
        <audio controls preload="metadata" src={output.url} aria-label={`播放 ${name}`}>
          你的浏览器不支持音频播放。
        </audio>
      ) : (
        <a className="output-link" href={output.url} target="_blank" rel="noreferrer">
          <ArrowSquareOut size={16} aria-hidden="true" />
          打开生成产物
        </a>
      )}
    </article>
  );
}

export function Studio({ siteName }: StudioProps) {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [selectedProviderId, setSelectedProviderId] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [rememberKey, setRememberKey] = useState(false);
  const [activeKey, setActiveKey] = useState("");
  const [schema, setSchema] = useState<AppSchema | null>(null);
  const [values, setValues] = useState<Values>({});
  const [files, setFiles] = useState<Record<string, File>>({});
  const [connecting, setConnecting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [job, setJob] = useState<JobView | null>(null);
  const [pollingTaskId, setPollingTaskId] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [formError, setFormError] = useState<FormError>(null);
  const [transientError, setTransientError] = useState<FormError>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const generationStartedAt = useRef(0);
  const connected = Boolean(activeKey && schema);
  const activeProvider = useMemo(
    () =>
      config?.providers.find(
        (provider) => provider.id === (schema?.providerId ?? selectedProviderId),
      ) ?? null,
    [config, schema?.providerId, selectedProviderId],
  );
  const jobProviderId = job?.providerId ?? schema?.providerId ?? selectedProviderId ?? "runninghub";
  const canCancel = activeProvider?.capabilities.cancellation !== false;
  const isInstantProvider = activeProvider?.capabilities.directOutput === true;
  const canUpload = activeProvider?.capabilities.uploads !== false;

  useEffect(() => {
    let cancelled = false;
    requestJson<PublicConfig>("/api/v1/config", { method: "GET" })
      .then((data) => {
        if (cancelled) return;
        setConfig(data);
        const firstProvider = data.providers?.[0]?.id ?? "runninghub";
        setSelectedProviderId((current) => current || firstProvider);
        try {
          const saved = sessionStorage.getItem(keyStorageName(firstProvider));
          if (saved) {
            setKeyInput(saved);
            setRememberKey(true);
          }
        } catch {
          // Private browsing can disable storage; the in-memory flow still works.
        }
      })
      .catch((error) => {
        if (!cancelled) setConfigError(messageFromError(error));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const storageProviderId = schema?.providerId ?? selectedProviderId;
    if (!storageProviderId) return;
    try {
      if (rememberKey && activeKey) {
        sessionStorage.setItem(keyStorageName(storageProviderId), activeKey);
      } else {
        sessionStorage.removeItem(keyStorageName(storageProviderId));
      }
    } catch {
      // Storage is optional.
    }
  }, [rememberKey, activeKey, schema?.providerId, selectedProviderId]);

  useEffect(() => {
    if (!formError) return;
    requestAnimationFrame(() => errorRef.current?.focus());
  }, [formError]);

  useEffect(() => {
    if (!pollingTaskId) return;

    const update = () => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - generationStartedAt.current) / 1000)));
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [pollingTaskId]);

  useEffect(() => {
    if (!pollingTaskId || !activeKey) return;
    let cancelled = false;
    let timer = 0;

    const tick = async () => {
      if (cancelled) return;
      if (Date.now() - generationStartedAt.current >= GENERATION_TIMEOUT_MS) {
        setJob((current) => current ? { ...current, status: "TIMEOUT" } : current);
        setPollingTaskId(null);
        setTransientError({
          message: "页面等待生成结果超过了 15 分钟。",
          hint: "任务可能仍在上游继续运行，可以稍后重新查询，或前往服务商控制台查看。",
        });
        return;
      }

      try {
        const next = await requestJson<JobView>(
          `/api/v1/jobs/${encodeURIComponent(pollingTaskId)}?provider=${encodeURIComponent(jobProviderId)}`,
          { method: "GET", headers: { "x-rh-key": activeKey } },
        );
        if (cancelled) return;
        setJob(next);
        setTransientError(null);
        if (TERMINAL_STATUSES.has(next.status)) {
          setPollingTaskId(null);
        } else {
          timer = window.setTimeout(tick, POLL_INTERVAL_MS);
        }
      } catch (error) {
        if (cancelled) return;
        setTransientError({
          message: messageFromError(error),
          hint: hintFromError(error) || "正在自动重试，请保持页面打开。",
        });
        if (error instanceof ClientApiError && error.status === 401) {
          setPollingTaskId(null);
        } else {
          timer = window.setTimeout(tick, POLL_INTERVAL_MS);
        }
      }
    };

    timer = window.setTimeout(tick, 700);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [pollingTaskId, activeKey, jobProviderId]);

  const clearSessionKey = useCallback((providerId: string) => {
    try { sessionStorage.removeItem(keyStorageName(providerId)); } catch { /* noop */ }
  }, []);

  const selectProvider = useCallback((providerId: string) => {
    setSelectedProviderId(providerId);
    setFormError(null);
    setTransientError(null);
    try {
      const saved = sessionStorage.getItem(keyStorageName(providerId));
      setKeyInput(saved ?? "");
    } catch {
      setKeyInput("");
    }
  }, []);

  const disconnect = useCallback(() => {
    setActiveKey("");
    setSchema(null);
    setValues({});
    setFiles({});
    setJob(null);
    setPollingTaskId(null);
    setFormError(null);
    setTransientError(null);
    if (!rememberKey) setKeyInput("");
  }, [rememberKey]);

  const connect = async (event?: FormEvent) => {
    event?.preventDefault();
    setFormError(null);
    setTransientError(null);
    setElapsedSeconds(0);

    const key = keyInput.trim();
    const providerId = selectedProviderId || "runninghub";
    if (!key) {
      setFormError({ message: "请先输入 API Key。" });
      return;
    }
    if (/\s/.test(key) || key.length < 8 || key.length > 200) {
      setFormError({
        message: "API Key 格式看起来不正确。",
        hint: "请从服务商控制台重新复制完整 Key，确认没有空格。",
      });
      return;
    }
    if (!config?.configured) {
      setFormError({
        message: "站点还没有配置任何生成服务。",
        hint: "部署者需要在环境变量中配置至少一个提供商后重新部署。",
      });
      return;
    }

    setConnecting(true);
    try {
      const nextSchema = await requestJson<AppSchema>(
        `/api/v1/schema?provider=${encodeURIComponent(providerId)}`,
        {
          method: "GET",
          headers: { "x-rh-key": key },
        },
      );
      setSchema(nextSchema);
      setValues(initialValues(nextSchema.fields));
      setFiles({});
      setJob(null);
      setPollingTaskId(null);
      setSelectedProviderId(nextSchema.providerId || providerId);
      setActiveKey(key);
      if (rememberKey) {
        try {
          sessionStorage.setItem(keyStorageName(nextSchema.providerId || providerId), key);
        } catch { /* noop */ }
      } else {
        clearSessionKey(nextSchema.providerId || providerId);
      }
    } catch (error) {
      setFormError({ message: messageFromError(error), hint: hintFromError(error) });
      setActiveKey("");
      setSchema(null);
    } finally {
      setConnecting(false);
    }
  };

  const updateValue = (key: string, value: FieldValue) => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  const startGeneration = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeKey || !schema || submitting || uploading) return;
    setFormError(null);
    setTransientError(null);

    const preparedValues: Values = { ...values };
    const fileFields = canUpload
      ? schema.fields.filter((field) => field.type === "file" && files[field.key])
      : [];
    if (fileFields.length === 0 && !Object.values(preparedValues).some((value) => value !== "" && value !== undefined)) {
      setFormError({
        message: "还没有可提交的内容。",
        hint: "请至少填写一段提示词、歌词，或选择一个参考文件。",
      });
      return;
    }

    setSubmitting(true);
    try {
      if (fileFields.length > 0) {
        setUploading(true);
        for (const field of fileFields) {
          const form = new FormData();
          form.append("file", files[field.key]);
          const uploaded = await requestJson<UploadResult>(
            `/api/v1/uploads?provider=${encodeURIComponent(schema.providerId)}`,
            {
              method: "POST",
              headers: { "x-rh-key": activeKey },
              body: form,
            },
          );
          preparedValues[field.key] = uploaded.fileName || uploaded.url || "";
        }
        setUploading(false);
        setValues(preparedValues);
      }

      const created = await requestJson<JobView>(
        "/api/v1/generate",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-rh-key": activeKey,
          },
          body: JSON.stringify({ providerId: schema.providerId, values: preparedValues }),
        },
      );

      generationStartedAt.current = Date.now();
      setJob(created);
      setPollingTaskId(TERMINAL_STATUSES.has(created.status) ? null : created.taskId);
    } catch (error) {
      setFormError({ message: messageFromError(error), hint: hintFromError(error) });
    } finally {
      setSubmitting(false);
      setUploading(false);
    }
  };

  const cancelGeneration = async () => {
    if (!activeKey || !job?.taskId) return;
    try {
      await requestJson<{ taskId: string; cancelled: boolean }>(
        `/api/v1/jobs/${encodeURIComponent(job.taskId)}/cancel?provider=${encodeURIComponent(jobProviderId)}`,
        { method: "POST", headers: { "x-rh-key": activeKey } },
      );
      setJob((current) => current ? { ...current, status: "CANCELLED" } : current);
      setPollingTaskId(null);
    } catch (error) {
      setTransientError({ message: messageFromError(error), hint: hintFromError(error) });
    }
  };

  const refreshJob = async () => {
    if (!activeKey || !job?.taskId) return;
    setTransientError(null);
    try {
      const next = await requestJson<JobView>(
        `/api/v1/jobs/${encodeURIComponent(job.taskId)}?provider=${encodeURIComponent(jobProviderId)}`,
        { method: "GET", headers: { "x-rh-key": activeKey } },
      );
      setJob(next);
      if (!TERMINAL_STATUSES.has(next.status)) {
        generationStartedAt.current = Date.now() - elapsedSeconds * 1000;
        setPollingTaskId(next.taskId);
      }
    } catch (error) {
      setTransientError({ message: messageFromError(error), hint: hintFromError(error) });
    }
  };

  const primaryFields = useMemo(
    () => schema?.fields.filter((field) => field.group === "primary") ?? [],
    [schema],
  );
  const advancedFields = useMemo(
    () => schema?.fields.filter((field) => field.group === "advanced") ?? [],
    [schema],
  );
  const busy = submitting || uploading;
  const isPolling = Boolean(pollingTaskId);

  const copyKey = async () => {
    if (!keyInput) return;
    try {
      await navigator.clipboard.writeText(keyInput);
      setCopiedKey(true);
      window.setTimeout(() => setCopiedKey(false), 1600);
    } catch {
      setFormError({ message: "浏览器没有允许读取剪贴板，请手动选择 Key。" });
    }
  };

  return (
    <div className="site-shell">
      <a className="skip-link" href="#studio">跳到生成表单</a>
      <AppHeader siteName={siteName} />

      <main>
        <section className="page-wrap hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <span className="eyebrow"><span className="eyebrow-dot" aria-hidden="true" />AI music workstation</span>
            <h1 id="hero-title">把一句<span className="word">灵感</span>，<em>压进</em><span className="word">黑胶</span>的纹路。</h1>
            <p className="hero-lede">
              一个不需要注册的音乐工作室。连接你自己的 API Key，
              用已发布的 AI 工作流把提示词、歌词和风格变成可播放的作品。
            </p>
            <div className="hero-meta" aria-label="服务特点">
              <span className="meta-chip"><LockKey size={14} weight="duotone" aria-hidden="true" />Key 不落库</span>
              <span className="meta-chip"><Key size={14} weight="duotone" aria-hidden="true" />自带额度</span>
              <span className="meta-chip"><SlidersHorizontal size={14} weight="duotone" aria-hidden="true" />字段自动适配</span>
            </div>
          </div>
          <aside className="hero-aside" aria-label="工作室状态">
            <span className="aside-kicker">Now recording</span>
            <h2>{siteName}</h2>
            <p>深色录音台，实时任务状态。生成时你可以继续调整下一段旋律的想法。</p>
            <WaveformBars />
          </aside>
        </section>

        <section className="page-wrap workspace" id="studio" aria-label="音乐生成工作台">
          <div className="studio-card">
            <div className="card-head">
              <span className="card-step">{connected ? "02" : "01"}</span>
              <div className="card-heading">
                <h2>{connected ? "写下这一首的声音" : "接入你的 API Key"}</h2>
                <p>
                  {connected
                    ? `已读取「${schema?.appName || "服务"}」的 ${schema?.fields.length || 0} 个可用参数。填写后即可提交。`
                    : "Key 只随请求发送给对应的服务商。未勾选记住时，关闭页面即从内存清除。"}
                </p>
              </div>
              <span className={config?.configured ? "config-badge ok" : "config-badge"}>
                {config?.configured ? <CheckCircle size={14} aria-hidden="true" /> : <WarningCircle size={14} aria-hidden="true" />}
                {config?.configured ? "应用已配置" : "等待部署配置"}
              </span>
            </div>

            <div className="card-body">
              {configError ? (
                <div className="alert" role="alert">
                  <WarningCircle size={19} aria-hidden="true" />
                  <div><strong>无法读取站点配置</strong>{configError}</div>
                </div>
              ) : null}

              {config && !config.configured && !connected ? (
                <div className="alert info" style={{ marginBottom: 20 }}>
                  <WarningCircle size={19} aria-hidden="true" />
                  <div>
                    <strong>部署者还差最后一步</strong>
                    在部署环境变量中配置至少一个生成服务（例如 <code className="inline-code">RUNNINGHUB_WEBAPP_ID</code>），
                    指向已发布的音乐生成应用。配置完成后，访客即可连接自己的 Key。
                  </div>
                </div>
              ) : null}

              {!connected ? (
                <form className="stack" onSubmit={connect} noValidate>
                  {config && config.providers.length > 1 ? (
                    <div className="field">
                      <span className="field-label">选择生成服务</span>
                      <div className="provider-picker" role="radiogroup" aria-label="选择生成服务">
                        {config.providers.map((provider) => (
                          <label
                            key={provider.id}
                            className={
                              provider.id === selectedProviderId
                                ? "provider-card selected"
                                : "provider-card"
                            }
                          >
                            <input
                              type="radio"
                              name="provider"
                              value={provider.id}
                              checked={provider.id === selectedProviderId}
                              onChange={() => selectProvider(provider.id)}
                            />
                            <span className="provider-name">{provider.name}</span>
                            <span className="provider-desc">{provider.description}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="field">
                    <label className="field-label" htmlFor="runninghub-key">
                      {activeProvider?.keyLabel || "API Key"}
                      <a
                        href={activeProvider?.docsUrl || "https://www.runninghub.cn/enterprise-api/sharedApi"}
                        target="_blank"
                        rel="noreferrer"
                        className="side-link"
                        style={{ margin: 0 }}
                      >
                        获取 Key <ArrowSquareOut size={13} aria-hidden="true" />
                      </a>
                    </label>
                    <div className="key-field">
                      <input
                        id="runninghub-key"
                        className="input"
                        type={showKey ? "text" : "password"}
                        value={keyInput}
                        onChange={(event) => setKeyInput(event.target.value)}
                        autoComplete="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        placeholder="粘贴你的 API Key"
                        aria-describedby="key-help"
                      />
                      <button
                        type="button"
                        className="icon-btn key-reveal"
                        onClick={() => setShowKey((value) => !value)}
                        aria-label={showKey ? "隐藏 API Key" : "显示 API Key"}
                        aria-pressed={showKey}
                      >
                        {showKey ? <EyeSlash size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}
                      </button>
                    </div>
                    <p className="field-help" id="key-help">
                      用于验证应用并读取可填写字段。服务端不会持久化保存。
                    </p>
                  </div>

                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={rememberKey}
                      onChange={(event) => setRememberKey(event.target.checked)}
                    />
                    <span>仅在当前标签页记住 Key（sessionStorage）。默认关闭，不使用 localStorage 或 Cookie。</span>
                  </label>

                  <div className="security-note">
                    <LockKey size={17} weight="duotone" aria-hidden="true" />
                    <span>本站不收集账号、不保存生成历史。费用与额度直接计入你的服务商账户；生成链接的有效期由服务商决定。</span>
                  </div>

                  {keyInput ? (
                    <div className="btn-row">
                      <button type="button" className="btn btn-ghost" onClick={copyKey}>
                        <Copy size={16} aria-hidden="true" />{copiedKey ? "已复制" : "复制 Key"}
                      </button>
                    </div>
                  ) : null}

                  {formError ? (
                    <div className="alert" role="alert" tabIndex={-1} ref={errorRef}>
                      <WarningCircle size={19} aria-hidden="true" />
                      <div><strong>{formError.message}</strong>{formError.hint || ""}</div>
                    </div>
                  ) : null}

                  <button
                    className="btn btn-primary btn-block"
                    type="submit"
                    disabled={connecting || !config?.configured}
                  >
                    {connecting ? <span className="spinner" aria-hidden="true" /> : <Key size={18} aria-hidden="true" />}
                    {connecting ? "正在验证并读取字段…" : `连接 ${activeProvider?.name || "RunningHub"}`}
                    {!connecting ? <ArrowRight size={18} aria-hidden="true" /> : null}
                  </button>
                </form>
              ) : (
                <div className="stack">
                  <div className="status-box">
                    <div className="status-top">
                      <div className="status-label">
                        <CheckCircle size={19} weight="fill" color="var(--color-play)" aria-hidden="true" />
                        已连接 · {schema?.appName}
                      </div>
                      <button type="button" className="btn btn-ghost" onClick={disconnect}>
                        更换 Key
                      </button>
                    </div>
                    <div className="status-meta">
                      <span><Broadcast size={13} aria-hidden="true" />服务 ID {schema?.appId}</span>
                      <span><SlidersHorizontal size={13} aria-hidden="true" />{schema?.fields.length} 个可调参数</span>
                    </div>
                  </div>

                  <form className="stack" onSubmit={startGeneration} noValidate>
                    {formError ? (
                      <div className="alert" role="alert" tabIndex={-1} ref={errorRef}>
                        <WarningCircle size={19} aria-hidden="true" />
                        <div><strong>{formError.message}</strong>{formError.hint || ""}</div>
                      </div>
                    ) : null}

                    {primaryFields.map((field) => (
                      <FieldControl
                        key={field.key}
                        field={field}
                        value={values[field.key]}
                        file={files[field.key]}
                        onChange={(value) => updateValue(field.key, value)}
                        onFile={(file) => setFiles((current) => ({ ...current, [field.key]: file }))}
                      />
                    ))}

                    {advancedFields.length > 0 ? (
                      <details className="advanced">
                        <summary>
                          <span><SlidersHorizontal size={16} aria-hidden="true" style={{ marginRight: 8, verticalAlign: -3 }} />高级参数 · {advancedFields.length}</span>
                          <CaretDown size={16} aria-hidden="true" />
                        </summary>
                        <div className="advanced-body">
                          {advancedFields.map((field) => (
                            <FieldControl
                              key={field.key}
                              field={field}
                              value={values[field.key]}
                              file={files[field.key]}
                              onChange={(value) => updateValue(field.key, value)}
                              onFile={(file) => setFiles((current) => ({ ...current, [field.key]: file }))}
                            />
                          ))}
                        </div>
                      </details>
                    ) : null}

                    <div className="btn-row">
                      <button className="btn btn-primary" type="submit" disabled={busy || isPolling}>
                        {busy ? <span className="spinner" aria-hidden="true" /> : <MusicNotes size={18} aria-hidden="true" />}
                        {uploading ? "上传参考文件…" : submitting ? "正在提交…" : isPolling ? "正在生成…" : "开始生成"}
                      </button>
                      {isPolling && canCancel ? (
                        <button className="btn btn-danger" type="button" onClick={cancelGeneration}>
                          <StopCircle size={18} aria-hidden="true" />取消任务
                        </button>
                      ) : null}
                    </div>
                  </form>

                  {job ? (
                    <section className="status-box" aria-labelledby="job-status-title">
                      <div className="status-top">
                        <div className="status-label" id="job-status-title">
                          {job.status === "SUCCESS" ? <CheckCircle size={19} weight="fill" color="var(--color-play)" aria-hidden="true" /> : <Broadcast size={19} weight="duotone" color="var(--color-amber)" aria-hidden="true" />}
                          {statusLabel(job)}
                        </div>
                        <span className={`status-chip ${statusTone(job)}`}>
                          {isPolling ? <span className="spinner" style={{ width: 10, height: 10 }} aria-hidden="true" /> : null}
                          {job.status}
                        </span>
                      </div>

                      <div className="status-meta">
                        <span>任务 {job.taskId}</span>
                        <span>{formatSeconds(elapsedSeconds)}</span>
                        {job.usage?.cost ? <span>消耗 {job.usage.cost}</span> : null}
                      </div>

                      {isPolling ? (
                        <>
                          <div className="progress-track" aria-hidden="true"><span /></div>
                          <p className="field-help" aria-live="polite">
                            正在轮询 {activeProvider?.name || "上游服务"}。音乐生成通常需要数分钟，请不要关闭页面。
                          </p>
                        </>
                      ) : null}

                      {job.error ? (
                        <div className="alert" role="alert">
                          <WarningCircle size={19} aria-hidden="true" />
                          <div><strong>{job.error.message}</strong>{job.error.hint || `错误码：${job.error.code}`}</div>
                        </div>
                      ) : null}

                      {transientError ? (
                        <div className="alert info" role="status">
                          <WarningCircle size={19} aria-hidden="true" />
                          <div><strong>{transientError.message}</strong>{transientError.hint || ""}</div>
                        </div>
                      ) : null}

                      {!isPolling && !isInstantProvider && (job.status === "TIMEOUT" || job.status === "FAILED") ? (
                        <div className="btn-row">
                          <button type="button" className="btn btn-secondary" onClick={refreshJob}>重新查询任务</button>
                        </div>
                      ) : null}

                      {job.status === "SUCCESS" && job.outputs.length > 0 ? (
                        <div className="result">
                          <div className="result-head">
                            <div>
                              <span className="result-kicker">Mastered output</span>
                              <div className="result-title"><h3>你的作品已经就绪</h3></div>
                            </div>
                          </div>
                          <div className="output-list">
                            {job.outputs.map((output, index) => (
                              <OutputCard key={`${output.url}-${index}`} output={output} index={index} />
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {job.status === "SUCCESS" && job.outputs.length === 0 ? (
                        <div className="alert info" role="status">
                          <WarningCircle size={19} aria-hidden="true" />
                          <div><strong>任务完成，但没有返回可下载产物。</strong>请检查服务商应用的输出节点与产物类型，或重新查询任务。</div>
                        </div>
                      ) : null}
                    </section>
                  ) : null}
                </div>
              )}
            </div>
          </div>

          <aside className="side-stack" aria-label="使用说明与状态">
            <div className="side-card">
              <h3>录音流程</h3>
              <div className="steps">
                <div className={connected ? "step done" : "step active"}>
                  <span className="step-index">{connected ? "✓" : "1"}</span>
                  <div className="step-copy"><strong>连接账户</strong><span>粘贴 Key，验证并读取字段</span></div>
                </div>
                <div className={job && TERMINAL_STATUSES.has(job.status) ? "step done" : connected ? "step active" : "step"}>
                  <span className="step-index">{job && TERMINAL_STATUSES.has(job.status) ? "✓" : "2"}</span>
                  <div className="step-copy"><strong>编排声音</strong><span>填写灵感、歌词与高级参数</span></div>
                </div>
                <div className={job?.status === "SUCCESS" ? "step done" : isPolling ? "step active" : "step"}>
                  <span className="step-index">{job?.status === "SUCCESS" ? "✓" : "3"}</span>
                  <div className="step-copy"><strong>播放与下载</strong><span>任务完成后试听并保存作品</span></div>
                </div>
              </div>
            </div>

            <div className="side-card">
              <h3>工作流</h3>
              <p>站点通过各服务商的 API 运行音乐生成。RunningHub 走动态 AI 应用，可调字段来自已发布的应用；其他服务使用固定的中文参数集，字段含义一目了然。</p>
              <a className="side-link" href={WORKFLOW_URL} target="_blank" rel="noreferrer">
                查看源工作流 <ArrowSquareOut size={14} aria-hidden="true" />
              </a>
            </div>

            <div className="side-card">
              <h3>Key 安全</h3>
              <p>Key 不会进入 URL、Cookie、localStorage 或构建产物。服务端仅在本请求生命周期内转发它；默认也不写日志。</p>
              <Link className="side-link" href="/docs#security">阅读安全说明 <ArrowRight size={14} aria-hidden="true" /></Link>
            </div>
          </aside>
        </section>
      </main>

      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {job ? `任务状态：${statusLabel(job)}` : connected ? `已连接 ${activeProvider?.name || "生成服务"}` : "尚未连接生成服务"}
      </div>
      <AppFooter siteName={siteName} />
    </div>
  );
}

