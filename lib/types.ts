export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "select"
  | "boolean"
  | "file"
  | "unknown";

export interface FieldOption {
  value: string;
  label: string;
}

export interface Field {
  key: string;
  nodeId: string;
  fieldName: string;
  nodeName: string;
  label: string;
  help?: string;
  type: FieldType;
  defaultValue?: string | number | boolean;
  options?: FieldOption[];
  group: "primary" | "advanced";
}

export type ProviderKind =
  | "runninghub"
  | "replicate"
  | "fal"
  | "openai-audio";

export interface ProviderCapabilities {
  dynamicSchema: boolean;
  uploads: boolean;
  cancellation: boolean;
  directOutput: boolean;
}

export interface ProviderSummary {
  id: string;
  name: string;
  kind: ProviderKind;
  description: string;
  configured: boolean;
  keyLabel: string;
  docsUrl?: string;
  modelLabel?: string;
  capabilities: ProviderCapabilities;
}

export interface AppSchema {
  appId: string;
  appName: string;
  providerId: string;
  providerName: string;
  fields: Field[];
}

export type FieldValue = string | number | boolean;
export type Values = Record<string, FieldValue>;

export interface NodeInput {
  nodeId: string;
  fieldName: string;
  fieldValue: FieldValue;
}

export type JobStatus =
  | "QUEUED"
  | "RUNNING"
  | "SUCCESS"
  | "FAILED"
  | "CANCELLED"
  | "TIMEOUT";

export interface OutputItem {
  url: string;
  type: string;
  label?: string;
}

export interface JobError {
  code: string;
  message: string;
  hint?: string;
}

export interface JobView {
  providerId: string;
  taskId: string;
  status: JobStatus;
  outputs: OutputItem[];
  error: JobError | null;
  usage?: {
    cost?: string;
    durationSeconds?: number;
  } | null;
}

export interface GenerateRequest {
  providerId?: string;
  values: Values;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    hint?: string;
  };
}

export interface RawNode {
  nodeId?: string | number;
  nodeName?: string;
  fieldName?: string;
  fieldValue?: unknown;
  fieldData?: unknown;
  fieldType?: string;
  description?: string;
  descriptionEn?: string;
}

