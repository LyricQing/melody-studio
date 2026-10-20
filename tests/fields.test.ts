import { describe, expect, it } from "vitest";
import {
  buildNodeInfoList,
  classifyField,
  initialValues,
  normalizeSchema,
  parseFieldData,
} from "@/lib/fields";
import { AppError, redact } from "@/lib/errors";
import type { RawNode } from "@/lib/types";

const nodes: RawNode[] = [
  {
    nodeId: "12",
    nodeName: "Prompt",
    fieldName: "text",
    fieldType: "STRING",
    description: "提示词",
    fieldValue: "夏夜",
    fieldData: JSON.stringify({ multiline: true }),
  },
  {
    nodeId: "19",
    nodeName: "Style",
    fieldName: "style",
    fieldType: "LIST",
    description: "曲风",
    fieldValue: "folk",
    fieldData: JSON.stringify([{ value: "folk", label: "民谣" }, { value: "jazz", label: "爵士" }]),
  },
  {
    nodeId: "20",
    nodeName: "Duration",
    fieldName: "duration",
    fieldType: "INT",
    description: "时长",
    fieldValue: 30,
  },
  {
    nodeId: "21",
    nodeName: "Instrumental",
    fieldName: "instrumental",
    fieldType: "BOOLEAN",
    description: "纯音乐",
    fieldValue: false,
  },
  {
    nodeId: "22",
    nodeName: "Reference",
    fieldName: "reference_audio",
    fieldType: "AUDIO",
    description: "参考音频",
  },
];

describe("field normalization", () => {
  it("parses options and multiline metadata from fieldData", () => {
    const parsed = parseFieldData(JSON.stringify({
      multiline: true,
      options: [{ value: "a", label: "A" }, { index: "b", description: "B" }],
    }));
    expect(parsed.multiline).toBe(true);
    expect(parsed.options).toEqual([
      { value: "a", label: "A" },
      { value: "b", label: "B" },
    ]);
  });

  it("parses primitive string lists and COMBO option envelopes", () => {
    const sampler = parseFieldData(JSON.stringify([
      ["euler", "heun", "ddim"],
      { tooltip: "sampler" },
    ]));
    const language = parseFieldData(JSON.stringify([
      "COMBO",
      { options: ["en", "zh"], multiselect: false },
    ]));
    const stringField = parseFieldData(JSON.stringify([
      "STRING",
      { default: "", multiline: true },
    ]));

    expect(sampler.options.map((option) => option.value)).toEqual(["euler", "heun", "ddim"]);
    expect(language.options.map((option) => option.value)).toEqual(["en", "zh"]);
    expect(stringField.options).toEqual([]);
    expect(stringField.multiline).toBe(true);
  });
  it("classifies text, select, number, boolean and file fields", () => {
    expect(nodes.map(classifyField)).toEqual([
      "textarea", "select", "number", "boolean", "file",
    ]);
  });

  it("normalizes schema with stable nodeId:fieldName identities", () => {
    const schema = normalizeSchema(nodes, "1877265245566922800", "Song Factory");
    expect(schema.fields.map((field) => field.key)).toEqual([
      "12:text", "19:style", "20:duration", "21:instrumental", "22:reference_audio",
    ]);
    expect(schema.fields[0].group).toBe("primary");
    expect(schema.fields[0].defaultValue).toBe("夏夜");
  });

  it("builds a typed nodeInfoList and includes false booleans", () => {
    const schema = normalizeSchema(nodes, "1", "App");
    const values = initialValues(schema.fields);
    values["20:duration"] = 45;
    values["21:instrumental"] = false;
    values["12:text"] = "  温暖的民谣  ";

    expect(buildNodeInfoList(schema.fields, values)).toEqual([
      { nodeId: "12", fieldName: "text", fieldValue: "温暖的民谣" },
      { nodeId: "19", fieldName: "style", fieldValue: "folk" },
      { nodeId: "20", fieldName: "duration", fieldValue: 45 },
      { nodeId: "21", fieldName: "instrumental", fieldValue: false },
    ]);
  });

  it("rejects invalid numbers, select values and empty submissions", () => {
    const schema = normalizeSchema(nodes, "1", "App");
    expect(() => buildNodeInfoList(schema.fields, { "20:duration": "abc" })).toThrow(AppError);
    expect(() => buildNodeInfoList(schema.fields, { "19:style": "metal" })).toThrow(AppError);
    expect(() => buildNodeInfoList(schema.fields, {})).toThrow(/至少填写/);
  });
});

describe("secret redaction", () => {
  it("redacts key fields, bearer tokens and long hex strings", () => {
    const text = "https://x.test/?apiKey=abcdef&x=1 Authorization: Bearer secret123 0123456789abcdef0123456789abcdef01234567";
    const output = redact(text);
    expect(output).not.toContain("abcdef");
    expect(output).not.toContain("secret123");
    expect(output).not.toContain("0123456789abcdef0123456789abcdef01234567");
    expect(output).toContain("[redacted]");
  });
});