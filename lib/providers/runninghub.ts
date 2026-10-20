import { buildNodeInfoList } from "@/lib/fields";
import {
  cancelTask,
  fetchAppSchema,
  isAppConfigured,
  queryTask,
  runApp,
  uploadMedia,
} from "@/lib/runninghub";
import type { ProviderAdapter } from "@/lib/providers/types";
import type { JobView, Values } from "@/lib/types";

export const runningHubProvider: ProviderAdapter = {
  summary: {
    id: "runninghub",
    name: "RunningHub",
    kind: "runninghub",
    description: "运行动态 AI 应用工作流，可调字段由已发布的应用决定",
    get configured() {
      return isAppConfigured();
    },
    keyLabel: "RunningHub API Key",
    docsUrl: "https://www.runninghub.cn/enterprise-api/sharedApi",
    capabilities: {
      dynamicSchema: true,
      uploads: true,
      cancellation: true,
      directOutput: false,
    },
  },

  getSchema(apiKey: string) {
    return fetchAppSchema(apiKey);
  },

  async generate(apiKey: string, values: Values): Promise<JobView> {
    const schema = await fetchAppSchema(apiKey);
    const nodeInfoList = buildNodeInfoList(schema.fields, values);
    const created = await runApp(apiKey, nodeInfoList);
    return {
      providerId: "runninghub",
      taskId: created.taskId,
      status: created.status,
      outputs: [],
      error: null,
      usage: null,
    };
  },

  async getJob(apiKey: string, taskId: string): Promise<JobView> {
    const job = await queryTask(apiKey, taskId);
    return { ...job, providerId: "runninghub" };
  },

  async cancel(apiKey: string, taskId: string): Promise<boolean> {
    return cancelTask(apiKey, taskId);
  },

  async upload(apiKey: string, file: File) {
    return uploadMedia(apiKey, file);
  },
};
