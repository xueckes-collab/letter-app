import { ENV } from "../_core/env";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = process.env.OPENAI_RESPONSES_MODEL || "gpt-5.5";

export type ResponsesInputMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export interface InvokeResponsesBaseOptions {
  model?: string;
  input: ResponsesInputMessage[];
  maxOutputTokens?: number;
  useWebSearch?: boolean;
  requireWebSearch?: boolean;
}

export interface InvokeResponsesJSONOptions<T = unknown> extends InvokeResponsesBaseOptions {
  schemaName: string;
  schema: Record<string, unknown>;
  fallback?: T;
}

function assertOpenAIKey() {
  if (!ENV.openaiApiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
}

function extractOutputText(payload: any): string {
  if (typeof payload?.output_text === "string") return payload.output_text;

  const chunks: string[] = [];
  for (const item of payload?.output ?? []) {
    for (const content of item?.content ?? []) {
      if (typeof content?.text === "string") chunks.push(content.text);
    }
  }
  return chunks.join("\n").trim();
}

async function invokeResponsesRaw(options: InvokeResponsesBaseOptions & { text?: Record<string, unknown> }) {
  assertOpenAIKey();

  const tools = options.useWebSearch
    ? [{ type: "web_search" as const, external_web_access: true }]
    : undefined;

  const body: Record<string, unknown> = {
    model: options.model || DEFAULT_MODEL,
    input: options.input,
    ...(options.maxOutputTokens ? { max_output_tokens: options.maxOutputTokens } : {}),
    ...(tools ? { tools } : {}),
    ...(options.requireWebSearch ? { tool_choice: "required" } : {}),
    ...(options.text ? { text: options.text } : {}),
  };

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ENV.openaiApiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI Responses API error ${response.status}: ${errorText.slice(0, 1000)}`);
  }

  return response.json();
}

export async function invokeResponsesText(options: InvokeResponsesBaseOptions) {
  const payload = await invokeResponsesRaw(options);
  return extractOutputText(payload);
}

export async function invokeResponsesJSON<T = Record<string, unknown>>(options: InvokeResponsesJSONOptions<T>): Promise<T> {
  const payload = await invokeResponsesRaw({
    ...options,
    text: {
      format: {
        type: "json_schema",
        name: options.schemaName,
        strict: true,
        schema: options.schema,
      },
    },
  });

  const text = extractOutputText(payload);
  if (!text) {
    if (options.fallback !== undefined) return options.fallback;
    throw new Error("OpenAI Responses API returned empty structured output");
  }

  try {
    return JSON.parse(text) as T;
  } catch (error) {
    if (options.fallback !== undefined) return options.fallback;
    throw new Error(`Failed to parse Responses JSON output: ${error instanceof Error ? error.message : String(error)}`);
  }
}
