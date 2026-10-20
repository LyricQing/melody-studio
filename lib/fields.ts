import { AppError } from "@/lib/errors";
import type {
  AppSchema,
  Field,
  FieldOption,
  FieldType,
  FieldValue,
  NodeInput,
  RawNode,
  Values,
} from "@/lib/types";

const PRIMARY_FIELD_NAMES = new Set([
  "prompt",
  "text",
  "positive",
  "positive_prompt",
  "lyrics",
  "lyric",
  "style",
  "tags",
  "genre",
  "duration",
  "seconds",
  "title",
  "model",
  "instrumental",
  "bpm",
  "language",
  "mood",
  "voice",
  "seed",
  "negative",
  "negative_prompt",
]);

const LONG_TEXT_NAMES = new Set([
  "prompt",
  "text",
  "positive",
  "positive_prompt",
  "lyrics",
  "lyric",
  "negative",
  "negative_prompt",
  "description",
  "caption",
  "story",
  "style",
]);

const MAX_FIELDS = 80;
const MAX_NODE_INPUTS = 100;
const MAX_TEXT_LENGTH = 8000;

const FIELD_LABELS: Record<string, string> = {
  prompt: "提示词",
  text: "提示词",
  positive_prompt: "正向提示词",
  negative_prompt: "反向提示词",
  lyrics: "歌词",
  lyric: "歌词",
  style: "音乐风格",
  tags: "风格标签",
  genre: "曲风",
  duration: "时长（秒）",
  seconds: "时长（秒）",
  title: "歌曲标题",
  model: "模型",
  instrumental: "纯音乐",
  bpm: "BPM",
  language: "语言",
  mood: "情绪",
  voice: "人声",
  seed: "随机种子",
};

function safeParse(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const text = value.trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return value;
  }
}

export function parseFieldData(raw: unknown): {
  options: FieldOption[];
  multiline: boolean;
  upload: boolean;
} {
  const parsed = safeParse(raw);
  const options: FieldOption[] = [];
  let multiline = false;
  let upload = false;

  const addOption = (value: unknown, label: unknown) => {
    if (typeof value !== "string" && typeof value !== "number") return;
    const normalized = String(value);
    if (!normalized || options.some((option) => option.value === normalized)) {
      return;
    }
    options.push({
      value: normalized,
      label:
        typeof label === "string" && label.trim()
          ? label.trim()
          : normalized,
    });
  };

  const typeTags = new Set([
    "STRING", "INT", "INTEGER", "FLOAT", "NUMBER", "BOOLEAN", "BOOL",
    "LIST", "COMBO", "IMAGE", "AUDIO", "VIDEO", "UNET",
  ]);

  const walk = (node: unknown, depth: number) => {
    if (depth > 5 || node === null || node === undefined) return;

    if (Array.isArray(node)) {
      const first = node[0];
      const isTypeEnvelope =
        typeof first === "string" &&
        typeTags.has(first.toUpperCase()) &&
        node.length === 2 &&
        typeof node[1] === "object" &&
        node[1] !== null;

      if (!isTypeEnvelope && node.every((item) => typeof item === "string" || typeof item === "number")) {
        for (const item of node) addOption(item, item);
        return;
      }

      for (const item of node) {
        if (typeof item === "string") {
          if (item.toLowerCase() === "multiline") multiline = true;
          continue;
        }
        walk(item, depth + 1);
      }
      return;
    }

    if (typeof node !== "object") return;
    const record = node as Record<string, unknown>;

    if (record.multiline === true) multiline = true;
    if (
      record.image_upload === true ||
      record.audio_upload === true ||
      record.video_upload === true ||
      record.upload === true
    ) {
      upload = true;
    }

    if (record.index !== undefined) {
      addOption(
        record.index,
        record.description ?? record.label ?? record.name ?? record.index,
      );
      return;
    }

    if (
      record.value !== undefined &&
      (record.label !== undefined || record.name !== undefined)
    ) {
      addOption(
        record.value,
        record.label ?? record.description ?? record.name,
      );
    } else if (record.name !== undefined && record.description !== undefined) {
      addOption(record.name, record.description);
    }

    for (const key of ["options", "choices", "list", "items", "values"]) {
      if (record[key] !== undefined) walk(record[key], depth + 1);
    }
  };

  walk(parsed, 0);
  return { options, multiline, upload };
}

export function classifyField(node: RawNode): FieldType {
  const fieldType = String(node.fieldType ?? "").toUpperCase();
  const fieldName = String(node.fieldName ?? "").toLowerCase();
  const data = parseFieldData(node.fieldData);

  if (
    fieldType === "IMAGE" ||
    fieldType === "AUDIO" ||
    fieldType === "VIDEO" ||
    data.upload
  ) {
    return "file";
  }
  if (fieldType === "LIST" || data.options.length > 0) return "select";
  if (
    fieldType === "INT" ||
    fieldType === "INTEGER" ||
    fieldType === "FLOAT" ||
    fieldType === "NUMBER"
  ) {
    return "number";
  }
  if (fieldType === "BOOLEAN" || fieldType === "BOOL") return "boolean";
  if (fieldType === "STRING") {
    return data.multiline || LONG_TEXT_NAMES.has(fieldName)
      ? "textarea"
      : "text";
  }
  if (typeof node.fieldValue === "boolean") return "boolean";
  if (typeof node.fieldValue === "number") return "number";
  if (data.options.length > 0) return "select";
  return "unknown";
}

function humanize(name: string): string {
  return name
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function defaultLabel(fieldName: string): string {
  const key = fieldName.toLowerCase();
  return FIELD_LABELS[key] ?? humanize(fieldName) ?? fieldName;
}

function primaryByName(fieldName: string): boolean {
  const key = fieldName.toLowerCase().replace(/\s+/g, "_");
  if (PRIMARY_FIELD_NAMES.has(key)) return true;
  return /prompt|lyric|style|genre|duration|title|model|mood|voice|bpm/.test(
    key,
  );
}

export function normalizeSchema(
  nodes: RawNode[],
  appId: string,
  appName: string,
  providerId: string = "runninghub",
  providerName: string = "RunningHub",
): AppSchema {
  const seen = new Set<string>();
  const fields: Field[] = [];

  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    const nodeId = String(node.nodeId ?? "").trim();
    const fieldName = String(node.fieldName ?? "").trim();
    if (!nodeId || !fieldName || fieldName.startsWith("__")) continue;

    const key = `${nodeId}:${fieldName}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const type = classifyField(node);
    const data = parseFieldData(node.fieldData);
    const labelFromUpstream =
      typeof node.description === "string" ? node.description.trim() : "";
    const labelEn =
      typeof node.descriptionEn === "string" ? node.descriptionEn.trim() : "";
    const label = labelFromUpstream || defaultLabel(fieldName);
    const help =
      labelEn && labelEn !== label
        ? labelEn
        : labelFromUpstream
          ? humanize(node.nodeName ?? fieldName)
          : undefined;

    const defaultValue =
      typeof node.fieldValue === "string" ||
      typeof node.fieldValue === "number" ||
      typeof node.fieldValue === "boolean"
        ? node.fieldValue
        : undefined;

    fields.push({
      key,
      nodeId,
      fieldName,
      nodeName: String(node.nodeName ?? "Node"),
      label,
      help,
      type,
      defaultValue,
      options: data.options.length ? data.options : undefined,
      group: primaryByName(fieldName) ? "primary" : "advanced",
    });

    if (fields.length >= MAX_FIELDS) break;
  }

  if (!fields.some((field) => field.group === "primary")) {
    for (const field of fields.slice(0, 6)) field.group = "primary";
  }

  return { appId, appName, providerId, providerName, fields };
}

export function initialValues(fields: Field[]): Values {
  const values: Values = {};
  for (const field of fields) {
    if (field.defaultValue !== undefined) {
      values[field.key] = field.defaultValue;
    } else if (field.type === "select" && field.options?.length) {
      values[field.key] = field.options[0].value;
    } else if (field.type === "boolean") {
      values[field.key] = false;
    } else {
      values[field.key] = "";
    }
  }
  return values;
}

export function buildNodeInfoList(
  fields: Field[],
  values: Values,
): NodeInput[] {
  const byKey = new Map(fields.map((field) => [field.key, field]));
  const result: NodeInput[] = [];

  for (const [key, rawValue] of Object.entries(values)) {
    const field = byKey.get(key);
    if (!field || rawValue === undefined || rawValue === null) continue;

    let fieldValue: FieldValue;
    if (field.type === "boolean") {
      fieldValue = Boolean(rawValue);
    } else if (field.type === "number") {
      const numeric =
        typeof rawValue === "number" ? rawValue : Number(String(rawValue));
      if (!Number.isFinite(numeric)) {
        throw new AppError(
          400,
          "INVALID_FIELD",
          `${field.label} 需要填写有效数字。`,
        );
      }
      fieldValue = numeric;
    } else {
      const text = String(rawValue).trim();
      if (!text) continue;
      if (text.length > MAX_TEXT_LENGTH) {
        throw new AppError(
          400,
          "FIELD_TOO_LONG",
          `${field.label} 太长了，请控制在 ${MAX_TEXT_LENGTH} 个字符以内。`,
        );
      }
      if (
        field.type === "select" &&
        field.options?.length &&
        !field.options.some((option) => option.value === text)
      ) {
        throw new AppError(
          400,
          "INVALID_OPTION",
          `${field.label} 的选项不在允许范围内。`,
        );
      }
      fieldValue = text;
    }

    result.push({
      nodeId: field.nodeId,
      fieldName: field.fieldName,
      fieldValue,
    });

    if (result.length >= MAX_NODE_INPUTS) break;
  }

  if (result.length === 0) {
    throw new AppError(
      400,
      "EMPTY_INPUT",
      "请至少填写一个生成参数。",
      { hint: "可以先写一段提示词或歌词，再点击生成。" },
    );
  }

  return result;
}

export function isAudioType(type: string, url = ""): boolean {
  const normalized = type.toLowerCase();
  if (
    /^(mp3|wav|flac|m4a|aac|ogg|opus|webm)$/.test(normalized)
  ) {
    return true;
  }
  return /\.(mp3|wav|flac|m4a|aac|ogg|opus)(\?|#|$)/i.test(url);
}

