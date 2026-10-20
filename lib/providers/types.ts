import type {
  AppSchema,
  FieldValue,
  JobView,
  ProviderSummary,
  Values,
} from "@/lib/types";

export interface ProviderAdapter {
  readonly summary: ProviderSummary;
  getSchema(apiKey: string): Promise<AppSchema>;
  generate(apiKey: string, values: Values): Promise<JobView>;
  getJob(apiKey: string, taskId: string): Promise<JobView>;
  cancel(apiKey: string, taskId: string): Promise<boolean>;
  upload?(apiKey: string, file: File): Promise<{ fileName: string; url?: string }>;
}

export type ProviderInput = Record<string, FieldValue>;